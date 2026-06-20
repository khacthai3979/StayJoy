import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildSystemMessage, KnowledgeSection, Room } from '@/lib/knowledge-base/builder'
import { callLLM } from '@/lib/llm/provider'
import { debounceMessage, cancelPending } from '@/lib/message-debounce'
import { sendEmail } from '@/lib/email'
import { checkRateLimit, checkInappropriateLanguage, checkJailbreak } from '@/lib/chatbot/moderation'
import { checkWebhookRateLimit } from '@/lib/chatbot/webhook-rate-limit'
import { logger } from '@/lib/logger'

// --- LLM Cost Guard: In-memory daily call counter per property ---
const llmDailyCallCounter = new Map<string, { date: string; count: number }>()
const LLM_DAILY_ALERT_THRESHOLD = 200 // Warn if a property exceeds this many LLM calls per day

/**
 * POST /api/chatwoot/webhook
 *
 * Receives webhook events from Chatwoot, processes incoming messages,
 * calls LLM with knowledge base context, and replies via Chatwoot API.
 *
 * This replaces n8n workflow entirely.
 */

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface ChatwootWebhookPayload {
  event: string
  message_type?: string
  content?: string
  conversation?: {
    id: number
    inbox_id: number
    status?: string
    contact?: {
      name?: string
      phone_number?: string
    }
    labels?: string[]
  }
  inbox?: {
    id: number
  }
  account?: {
    id: number
  }
}

async function replyToChatwoot(
  accountId: number,
  conversationId: number,
  message: string,
  messageType: 'outgoing' | 'private' = 'outgoing'
) {
  const chatwootUrl = process.env.CHATWOOT_URL || 'http://chatwoot-web:3000'
  const chatwootToken = process.env.CHATWOOT_BOT_TOKEN

  if (!chatwootToken) {
    console.error('[Chatwoot Webhook] CHATWOOT_BOT_TOKEN not configured')
    return
  }

  const url = `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api_access_token': chatwootToken,
    },
    body: JSON.stringify({
      content: message,
      message_type: 'outgoing', // Chatwoot expects 'outgoing' for message_type
      private: messageType === 'private', // Controls whether it's a private note
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[Chatwoot Webhook] Reply failed ${res.status}: ${text.slice(0, 200)}`)
  }
}

async function sendImageToChatwoot(
  accountId: number,
  conversationId: number,
  imageUrl: string,
  messageType: 'outgoing' | 'private' = 'outgoing'
) {
  const chatwootUrl = process.env.CHATWOOT_URL || 'http://chatwoot-web:3000'
  const chatwootToken = process.env.CHATWOOT_BOT_TOKEN

  if (!chatwootToken) {
    console.error('[Chatwoot Webhook] CHATWOOT_BOT_TOKEN not configured')
    return
  }

  try {
    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch image from URL: ${imageUrl}, status: ${imageRes.status}`)
    }
    const blob = await imageRes.blob()

    const formData = new FormData()
    formData.append('attachments[]', blob, 'room_image.jpg')
    formData.append('message_type', 'outgoing')
    formData.append('private', String(messageType === 'private'))

    const url = `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'api_access_token': chatwootToken,
      },
      body: formData,
    })

    if (!res.ok) {
      console.error('[Chatwoot Webhook] Failed to send image to Chatwoot:', res.status, await res.text())
    }
  } catch (err) {
    console.error('[Chatwoot Webhook] Error in sendImageToChatwoot:', err)
  }
}

async function getOwnerEmail(supabase: any, propertyId: string): Promise<string | null> {
  try {
    // 1. Check if property has a custom notification_email configured
    const { data: prop, error: propErr } = await supabase
      .from('properties')
      .select('notification_email')
      .eq('id', propertyId)
      .maybeSingle()

    if (!propErr && prop?.notification_email && prop.notification_email.trim() !== '') {
      return prop.notification_email.trim()
    }

    // 2. Fallback to users_properties lookup (original logic)
    const { data: userProps, error: err1 } = await supabase
      .from('users_properties')
      .select('user_id, role')
      .eq('property_id', propertyId)

    if (err1 || !userProps) {
      console.warn(`[Chatwoot Webhook] No users linked to property=${propertyId}`, err1)
      return null
    }

    const propsArray = Array.isArray(userProps) ? userProps : [userProps]
    if (propsArray.length === 0) {
      return null
    }

    // Sort to prefer 'owner', then 'admin', then others
    const preferred = [...propsArray].sort((a: any, b: any) => {
      const rolesOrder = ['owner', 'admin', 'user']
      const idxA = rolesOrder.indexOf(a?.role) !== -1 ? rolesOrder.indexOf(a?.role) : 99
      const idxB = rolesOrder.indexOf(b?.role) !== -1 ? rolesOrder.indexOf(b?.role) : 99
      return idxA - idxB
    })

    const userId = preferred[0]?.user_id
    if (!userId) return null

    const { data: userData, error: err2 } = await supabase.auth.admin.getUserById(
      userId
    )

    if (err2 || !userData?.user?.email) {
      console.warn(`[Chatwoot Webhook] Email not found for user_id=${userId}`, err2)
      return null
    }

    return userData.user.email
  } catch (err) {
    console.error('[Chatwoot Webhook] Error retrieving owner email:', err)
    return null
  }
}

async function getConversationHistory(

  accountId: number,
  conversationId: number
): Promise<string> {
  const chatwootUrl = process.env.CHATWOOT_URL || 'http://chatwoot-web:3000'
  const chatwootToken = process.env.CHATWOOT_BOT_TOKEN

  if (!chatwootToken) {
    console.error('[Chatwoot Webhook] CHATWOOT_BOT_TOKEN not configured')
    return ''
  }

  const url = `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'api_access_token': chatwootToken,
      },
    })
    if (!res.ok) {
      throw new Error(`Chatwoot API error: ${res.status}`)
    }
    const data = await res.json()
    const messages = data?.payload || []
    
    // Sort messages by timestamp ascending (oldest first) to guarantee correct chronological order
    const sorted = [...messages].sort((a: any, b: any) => {
      const t1 = typeof a.created_at === 'number' ? a.created_at * 1000 : new Date(a.created_at).getTime()
      const t2 = typeof b.created_at === 'number' ? b.created_at * 1000 : new Date(b.created_at).getTime()
      return t1 - t2
    })

    // Filter out private notes and empty/system messages
    const filtered = sorted.filter(
      (m: any) => !m.private && m.content && (m.message_type === 0 || m.message_type === 1)
    )

    // Remove the last message if it's from the customer (to prevent duplication with userMessage)
    if (filtered.length > 0 && filtered[filtered.length - 1].message_type === 0) {
      filtered.pop()
    }

    const historySlice = filtered.slice(-15)
    if (historySlice.length === 0) return ''

    return historySlice
      .map((m: any) => {
        const sender = m.message_type === 0 ? 'Khách' : 'Lễ tân AI'
        return `${sender}: "${m.content}"`
      })
      .join('\n')
  } catch (err) {
    console.error('[Chatwoot Webhook] Failed to fetch conversation history:', err)
    return ''
  }
}

export async function POST(request: NextRequest) {

  try {
    // --- LỚP 0: Chống spam IP (Webhook IP Rate Limiter) ---
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                     request.headers.get('x-real-ip') ||
                     'unknown'
    const ipRateLimit = checkWebhookRateLimit(clientIp)
    if (ipRateLimit.isLimited) {
      logger.warn('Webhook IP rate limited', { ip: clientIp, retryAfter: ipRateLimit.retryAfterSeconds })
      return NextResponse.json(
        { status: 'error', reason: 'too_many_requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(ipRateLimit.retryAfterSeconds || 60),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    const payload: ChatwootWebhookPayload = await request.json()

    // Only process incoming messages (from customer)
    if (payload.message_type !== 'incoming') {
      return NextResponse.json({ status: 'ignored', reason: 'not incoming' })
    }

    // Only process if conversation is pending or open
    const convStatus = payload.conversation?.status
    if (convStatus && !['pending', 'open'].includes(convStatus)) {
      return NextResponse.json({ status: 'ignored', reason: 'conversation not active' })
    }

    const content = payload.content
    if (!content || content.trim() === '') {
      return NextResponse.json({ status: 'ignored', reason: 'empty message' })
    }

    const inboxId = payload.conversation?.inbox_id || payload.inbox?.id
    const conversationId = payload.conversation?.id
    const accountId = payload.account?.id

    if (!inboxId || !conversationId || !accountId) {
      return NextResponse.json({ status: 'ignored', reason: 'missing ids' })
    }

    // --- LỚP 1: Chống spam tần suất gửi (Rate Limiter) ---
    // Gọi TRƯỚC khi debounce để bắt chính xác từng request gửi tới (chặn spam)
    const rateLimit = checkRateLimit(String(conversationId))
    if (rateLimit.isLimited) {
      logger.warn('Conversation rate limited', { conversationId })

      // HỦY BỎ NGAY LẬP TỨC các tin nhắn đang chờ trong hàng đợi Debounce của người này
      // Để tránh tình trạng 10 tin nhắn đầu vẫn bị gửi đi cho AI sau khi hết 30s
      cancelPending(String(conversationId))

      // Chỉ gửi thông báo cảnh báo 1 lần duy nhất trong vòng 1 phút
      // Các tin nhắn spam tiếp theo sẽ bị từ chối trong im lặng
      if (rateLimit.shouldWarn) {
        await replyToChatwoot(
          accountId,
          conversationId,
          '⚠️ Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi 1 phút trước khi tiếp tục gửi câu hỏi.'
        )
      }
      return NextResponse.json({ status: 'ignored', reason: 'rate_limited' })
    }

    // Debounce: gom nhiều tin nhắn liên tiếp từ cùng conversation trong vòng 30 giây
    const debouncedMessage = debounceMessage(String(conversationId), content)

    if (debouncedMessage === null) {
      return NextResponse.json({
        status: 'debounced',
        message: 'Message queued, waiting for more input',
      })
    }

    // Chờ debounce hoàn tất (30s sau tin nhắn cuối cùng)
    const combinedContent = await debouncedMessage

    // Nếu hàng đợi bị xoá (vd: do Rate limit chặn ngang và gọi cancelPending)
    // thì combinedContent sẽ là chuỗi rỗng -> kết thúc request an toàn không gọi AI
    if (!combinedContent) {
      return NextResponse.json({ status: 'ignored', reason: 'debounce_cancelled_due_to_spam' })
    }

    // --- LỚP 2: Chặn ngôn từ tục tĩu/không chuẩn mực ---
    if (checkInappropriateLanguage(combinedContent)) {
      logger.warn('Inappropriate language detected', { conversationId, content: combinedContent.slice(0, 100) })
      
      // 1. Phản hồi khách hàng
      await replyToChatwoot(
        accountId,
        conversationId,
        '⚠️ Hệ thống ghi nhận ngôn từ không phù hợp. Vui lòng trao đổi văn minh, chuẩn mực để được trợ lý ảo hỗ trợ.'
      )
      
      // 2. Ghi chú bảo mật cho chủ nhà
      const privateAlert = `🚨 CẢNH BÁO AN TOÀN:\nKhách hàng gửi tin nhắn chứa ngôn từ không chuẩn mực:\n"${combinedContent}"\n\n→ Chatbot đã từ chối trả lời.`
      await replyToChatwoot(accountId, conversationId, privateAlert, 'private')
      
      return NextResponse.json({ status: 'ignored', reason: 'inappropriate_language' })
    }

    // --- LỚP 3: Chặn mã độc câu lệnh / Phá quy tắc (Jailbreak) ---
    if (checkJailbreak(combinedContent)) {
      logger.warn('Jailbreak attempt detected', { conversationId, content: combinedContent.slice(0, 100) })
      
      // 1. Phản hồi khách hàng
      await replyToChatwoot(
        accountId,
        conversationId,
        '⚠️ Yêu cầu của bạn nằm ngoài phạm vi hỗ trợ của Lễ tân AI. Em chỉ hỗ trợ giải đáp thông tin homestay và đặt phòng thôi ạ!'
      )
      
      // 2. Ghi chú bảo mật cho chủ nhà
      const privateAlert = `🚨 CẢNH BÁO AN TOÀN:\nKhách hàng có dấu hiệu gửi câu hỏi phá vỡ quy tắc hoạt động (Jailbreak/Prompt Injection):\n"${combinedContent}"\n\n→ Chatbot đã từ chối thực hiện yêu cầu này.`
      await replyToChatwoot(accountId, conversationId, privateAlert, 'private')
      
      return NextResponse.json({ status: 'ignored', reason: 'jailbreak_attempt' })
    }

    const supabase = createServiceClient()

    // --- LỚP 4: Kiểm tra trạng thái Tắt/Bật Chatbot (Mute State qua Label) ---
    const labels = payload.conversation?.labels || []
    const isMuted = labels.some(
      (label) => label.toLowerCase() === 'tat-chatbot' || label.toLowerCase() === 'tat_chatbot'
    )
    if (isMuted) {
      logger.info('Chatbot muted via label', { conversationId })
      return NextResponse.json({ status: 'ignored', reason: 'chatbot_muted_via_label' })
    }

    // 1. First, lookup property_id from the active channel_mappings table (configured via Admin UI)
    const { data: channelMapping } = await supabase
      .from('channel_mappings')
      .select('property_id, is_active')
      .eq('inbox_id', String(inboxId))
      .maybeSingle()

    let propertyId = ''

    if (channelMapping) {
      if (!channelMapping.is_active) {
        logger.info('Channel inactive, ignored', { inboxId })
        return NextResponse.json({ status: 'ignored', reason: 'channel inactive' })
      }
      propertyId = channelMapping.property_id
    } else {
      // 2. Fallback to legacy chatwoot_inbox_mapping if not found in channel_mappings
      const { data: legacyMapping } = await supabase
        .from('chatwoot_inbox_mapping')
        .select('property_id')
        .eq('inbox_id', String(inboxId))
        .maybeSingle()

      if (!legacyMapping) {
        logger.error('No inbox mapping found', { inboxId })
        return NextResponse.json({ status: 'error', reason: 'inbox not mapped' }, { status: 404 })
      }
      propertyId = legacyMapping.property_id
    }

    // Check Quota and Limits
    const now = new Date()
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const [propertyRes, usageRes] = await Promise.all([
      supabase
        .from('properties')
        .select('plan, expires_at, telegram_chat_id')
        .eq('id', propertyId)
        .single(),
      supabase
        .from('monthly_usages')
        .select('message_count')
        .eq('property_id', propertyId)
        .eq('year_month', yearMonth)
        .maybeSingle()
    ])

    // If property query failed (e.g. RLS/network error), log and skip quota enforcement
    // to avoid falsely blocking premium users due to a DB read error.
    if (propertyRes.error || !propertyRes.data) {
      logger.error('Failed to fetch property plan', { propertyId, error: propertyRes.error?.message })
      // Fall through — do not apply quota if we cannot determine the plan
    } else {
      logger.info('Property plan resolved', { propertyId, plan: propertyRes.data.plan, expiresAt: propertyRes.data.expires_at })
    }

    const plan = propertyRes.data?.plan?.toLowerCase() ?? null
    const expiresAt = propertyRes.data?.expires_at
    const messageCount = usageRes.data?.message_count || 0

    // Only enforce quota/expiry if we could successfully read the property from DB.
    // If propertyRes.data is null (e.g. RLS error, network blip), skip enforcement
    // to avoid falsely blocking premium users due to a transient DB read failure.
    if (plan !== null) {
      const isExpired = expiresAt ? new Date(expiresAt) < now : false

      if (isExpired) {
        logger.warn('Subscription expired', { propertyId })
        const expiredMessage = `⚠️ Hệ thống tự động: Gói dịch vụ của Homestay đã hết hạn sử dụng. Chatbot đã tạm ngưng. Vui lòng truy cập trang Ví & Thanh toán hoặc liên hệ admin để gia hạn gói cước.`
        await replyToChatwoot(
          accountId,
          conversationId,
          expiredMessage,
          'private'
        )
        return NextResponse.json({ status: 'subscription_expired' })
      }

      const planLimits: Record<string, number> = {
        'trial': 50,
        'lite': 1000,
        'pro': 2500,
        'premium': 4000
      }
      const limit = planLimits[plan] ?? 1000

      if (messageCount >= limit) {
        logger.warn('Quota exceeded', { propertyId, plan, messageCount, limit })

        const isTrial = plan === 'trial'
        const exceededMessage = isTrial
          ? `⚠️ Hệ thống tự động: Homestay của bạn đang sử dụng gói dùng thử (TRIAL) và đã sử dụng hết hạn mức 50 tin nhắn miễn phí. Chatbot đã tạm ngưng. Bạn có muốn nâng cấp gói cước hay không? Vui lòng truy cập trang Ví & Thanh toán hoặc liên hệ admin để nâng cấp gói.`
          : `⚠️ Hệ thống tự động: Homestay của bạn đang sử dụng gói ${plan.toUpperCase()} và đã dùng hết giới hạn ${limit} tin nhắn của tháng này. Chatbot đã tạm ngưng. Vui lòng chat trực tiếp với khách hoặc liên hệ admin để tiếp tục sử dụng.`

        await replyToChatwoot(
          accountId,
          conversationId,
          exceededMessage,
          'private'
        )
        return NextResponse.json({ status: 'quota_exceeded' })
      }
    }


    // Build system message from knowledge base
    const [sectionsResult, roomsResult, imagesResult] = await Promise.all([
      supabase
        .from('knowledge_base_sections')
        .select('section_key, title, content, is_active, sort_order')
        .eq('property_id', propertyId),
      supabase
        .from('rooms')
        .select('room_id, loai_phong, suc_chua, gia_dem')
        .eq('property_id', propertyId),
      supabase
        .from('room_images')
        .select('room_id, image_url')
        .eq('property_id', propertyId)
        .order('sort_order', { ascending: true }),
    ])

    const sections: KnowledgeSection[] = sectionsResult.data ?? []
    const rooms: Room[] = roomsResult.data ?? []
    const roomImages = imagesResult.data ?? []

    // Format the current date/time to pass to the system message builder
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = now.getFullYear()
    const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
    const dayOfWeek = daysOfWeek[now.getDay()]
    const currentDateStr = `${dayOfWeek}, ngày ${day}/${month}/${year}`

    // Fetch bookings in the next 90 days for availability checking
    const ninetyDaysFromNow = new Date(now)
    ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90)
    
    const todayStrRaw = now.toISOString().split('T')[0]
    const ninetyDaysStr = ninetyDaysFromNow.toISOString().split('T')[0]

    const bookingsResult = await supabase
      .from('bookings')
      .select('phong, check_in, check_out, tinh_trang')
      .eq('property_id', propertyId)
      .in('tinh_trang', ['confirmed', 'paid', 'checked_in'])
      .gte('check_out', todayStrRaw)
      .lte('check_in', ninetyDaysStr)

    let bookedDatesStr = ''
    if (bookingsResult.data && bookingsResult.data.length > 0) {
      const bookedByRoom: Record<string, string[]> = {}
      for (const b of bookingsResult.data) {
        if (!b.phong) continue
        if (!bookedByRoom[b.phong]) bookedByRoom[b.phong] = []
        bookedByRoom[b.phong].push(`${b.check_in} -> ${b.check_out}`)
      }
      
      const lines = Object.entries(bookedByRoom).map(([roomId, dates]) => {
        return `- Phòng ${roomId}: Đã có khách đặt các khoảng thời gian: ${dates.join(', ')}`
      })
      bookedDatesStr = lines.join('\n')
    }

    // Build system message
    let systemMessage = buildSystemMessage(sections, rooms, plan, currentDateStr, bookedDatesStr)

    // Fetch and append conversation history for context
    const history = await getConversationHistory(accountId, conversationId)
    if (history) {
      systemMessage += `\n\n## LỊCH SỬ TRÒ CHUYỆN GẦN ĐÂY (Để tham khảo ngữ cảnh, theo thứ tự thời gian):\n${history}`
    }


    // Append image instruction if rooms have images
    if (roomImages.length > 0) {
      const imagesByRoom: Record<string, string[]> = {}
      for (const img of roomImages) {
        if (!imagesByRoom[img.room_id]) imagesByRoom[img.room_id] = []
        imagesByRoom[img.room_id].push(img.image_url)
      }

      const roomsWithImages = Object.keys(imagesByRoom)
      const imageInstruction = [
        '\n\n---\n\n## HƯỚNG DẪN GỬI HÌNH PHÒNG (BẮT BUỘC)',
        '',
        'Khi khách hàng hỏi xem hình ảnh, ảnh chụp hoặc muốn nhìn phòng, bạn BẮT BUỘC phải trả lời bình thường và thêm chính xác tag [SHOW_IMAGES:room_id] vào cuối câu trả lời.',
        'Hệ thống sẽ tự động chuyển đổi tag này thành ảnh thực tế gửi cho khách.',
        `Danh sách phòng có ảnh: ${roomsWithImages.join(', ')}`,
        '',
        'BẢN ĐỒ MAPPING PHÒNG (Hãy đối chiếu kỹ):',
        ...rooms.filter(r => roomsWithImages.includes(r.room_id)).map(r => `  - Phòng ID "${r.room_id}" hoặc loại phòng "${r.loai_phong}" -> Dùng tag: [SHOW_IMAGES:${r.room_id}]`),
        '',
        'LƯU Ý CÚ PHÁP:',
        '- Ví dụ: "Dạ, em gửi anh/chị xem ảnh của phòng Superior Giường Đôi (P101) ạ! [SHOW_IMAGES:P101]"',
        '- Nếu khách muốn xem hình tất cả các phòng hoặc nhiều phòng cùng lúc, hãy đính kèm nhiều tag: [SHOW_IMAGES:P101] [SHOW_IMAGES:P102]',
        '- Không sử dụng tag cho những phòng không có trong danh sách trên.',
      ].join('\n')

      systemMessage += imageInstruction
    }

    // Call LLM
    const llmResponse = await callLLM(
      { systemMessage, userMessage: combinedContent },
      propertyId,
      plan
    )

    // --- LLM Cost Guard: Track daily calls per property ---
    const todayStr = new Date().toISOString().split('T')[0]
    const costKey = propertyId
    const costEntry = llmDailyCallCounter.get(costKey)
    if (costEntry && costEntry.date === todayStr) {
      costEntry.count++
      if (costEntry.count === LLM_DAILY_ALERT_THRESHOLD) {
        logger.warn('LLM daily call threshold exceeded', {
          propertyId,
          dailyCalls: costEntry.count,
          threshold: LLM_DAILY_ALERT_THRESHOLD,
        })
      }
    } else {
      llmDailyCallCounter.set(costKey, { date: todayStr, count: 1 })
    }

    // Scan for [SHOW_IMAGES:room_id] tags
    const imageTags = llmResponse.answer.match(/\[SHOW_IMAGES:[^\]]+\]/g) || []

    // Reply to Chatwoot (strip tags before sending to customer)
    const cleanAnswer = llmResponse.answer
      .replace(/\[BOOKING_REQUEST\|[^\]]*\]/g, '')
      .replace(/\[OWNER_REQUEST\|[^\]]*\]/g, '')
      .replace(/\[SHOW_IMAGES:[^\]]+\]/g, '')
      .trim()
    await replyToChatwoot(accountId, conversationId, cleanAnswer)

    // Handle image sending if tags were emitted
    if (imageTags.length > 0 && roomImages.length > 0) {
      const imagesByRoom: Record<string, string[]> = {}
      for (const img of roomImages) {
        if (!imagesByRoom[img.room_id]) imagesByRoom[img.room_id] = []
        imagesByRoom[img.room_id].push(img.image_url)
      }

      for (const tag of imageTags) {
        const match = tag.match(/\[SHOW_IMAGES:([^\]]+)\]/)
        if (match) {
          const roomId = match[1].trim()
          const urls = imagesByRoom[roomId] || []
          
          if (urls.length > 0) {
            const roomInfo = rooms.find(r => r.room_id === roomId)
            const roomName = roomInfo ? `${roomInfo.loai_phong} (Phòng ${roomInfo.room_id})` : `Phòng ${roomId}`
            
            // Send a text message to clarify which room the following images belong to
            await replyToChatwoot(accountId, conversationId, `📸 Dạ đây là hình ảnh của **${roomName}** ạ:`)
            
            for (const url of urls) {
              await sendImageToChatwoot(accountId, conversationId, url)
            }
          }
        }
      }
    }

    // Check if AI detected a booking request (tag in response)
    const bookingMatch = llmResponse.answer.match(/\[BOOKING_REQUEST\|([^\]]+)\]/)
    if (bookingMatch) {
      const tagContent = bookingMatch[1]
      const fields: Record<string, string> = {}
      tagContent.split('|').forEach(pair => {
        const [key, ...valueParts] = pair.split('=')
        if (key && valueParts.length > 0) {
          fields[key.trim()] = valueParts.join('=').trim()
        }
      })

      // Insert booking request into database
      const { error: bookingError } = await supabase
        .from('bookings')
        .insert({
          property_id: propertyId,
          ho_ten: fields.ten || 'Không rõ',
          sdt: fields.sdt || '',
          so_phong: fields.phong || '',
          loai_phong: fields.phong || '',
          check_in: fields.checkin || new Date().toISOString().split('T')[0],
          check_out: fields.checkout || fields.checkin || new Date().toISOString().split('T')[0],
          tinh_trang: 'mới',
          conversation_id: String(conversationId),
        })

      if (bookingError) {
        logger.error('Failed to create booking request', { propertyId, error: bookingError.message })
      } else {
        // Send private note to owner
        const privateNote = `🔔 YÊU CẦU ĐẶT PHÒNG MỚI:\n👤 Tên: ${fields.ten || 'N/A'}\n📱 SĐT: ${fields.sdt || 'N/A'}\n📅 Check-in: ${fields.checkin || 'N/A'}\n📅 Check-out: ${fields.checkout || 'N/A'}\n🛏️ Phòng: ${fields.phong || 'N/A'}\n👥 Số người: ${fields.songuoi || 'N/A'}\n\n→ Vui lòng liên hệ khách để xác nhận.`
        await replyToChatwoot(accountId, conversationId, privateNote, 'private')
        logger.info('Booking request created', { propertyId, conversationId })

        // Send Email notification to owner
        const ownerEmail = await getOwnerEmail(supabase, propertyId)
        if (ownerEmail) {
          const emailSubject = `[StayJoy] Yêu cầu đặt phòng mới từ khách hàng`
          const emailText = `🔔 YÊU CẦU ĐẶT PHÒNG MỚI:\n\n👤 Họ tên: ${fields.ten || 'Không rõ'}\n📱 SĐT: ${fields.sdt || 'N/A'}\n📅 Check-in: ${fields.checkin || 'N/A'}\n📅 Check-out: ${fields.checkout || 'N/A'}\n🛏️ Loại phòng: ${fields.phong || 'N/A'}\n👥 Số khách: ${fields.songuoi || 'N/A'}\n\n→ Vui lòng liên hệ khách để xác nhận.\nXem chi tiết tại: https://app.stayjoy.io.vn/dashboard`
          await sendEmail(ownerEmail, emailSubject, emailText)
        }
      }
    }

    // Check if AI requested owner assistance (tag in response)
    const ownerMatch = llmResponse.answer.match(/\[OWNER_REQUEST\|([^\]]+)\]/)
    if (ownerMatch) {
      const tagContent = ownerMatch[1]
      const fields: Record<string, string> = {}
      tagContent.split('|').forEach(pair => {
        const [key, ...valueParts] = pair.split('=')
        if (key && valueParts.length > 0) {
          fields[key.trim()] = valueParts.join('=').trim()
        }
      })

      const reason = fields.message || 'Khách hàng có yêu cầu cần hỗ trợ trực tiếp'
      
      // Send private note to owner on Chatwoot
      const privateNote = `🔔 KHÁCH HÀNG CẦN HỖ TRỢ:\n💬 Nội dung: ${reason}\n\n→ Vui lòng vào chat trực tiếp hoặc liên hệ khách hàng.`
      await replyToChatwoot(accountId, conversationId, privateNote, 'private')
      logger.info('Owner assistance request detected', { propertyId, conversationId })

      // Send Email to owner
      const ownerEmail = await getOwnerEmail(supabase, propertyId)
      if (ownerEmail) {
        const emailSubject = `[StayJoy] Khách hàng yêu cầu hỗ trợ trực tiếp`
        const emailText = `🔔 KHÁCH HÀNG CẦN HỖ TRỢ:\n\n💬 Nội dung: ${reason}\n\nVui lòng truy cập Chatwoot để xem chi tiết hội thoại.`
        await sendEmail(ownerEmail, emailSubject, emailText)
      }

      // Log unhandled question for AI feedback loop
      const { error: insertError } = await supabase.from('unhandled_questions').insert({
        property_id: propertyId,
        conversation_id: String(conversationId),
        customer_message: combinedContent,
        ai_reason: reason,
        status: 'new'
      })
      
      if (insertError) {
        logger.error('Failed to log unhandled question', { error: insertError })
      }
    }

    // Increment usage asynchronously
    supabase.rpc('increment_monthly_usage', {
      p_property_id: propertyId,
      p_year_month: yearMonth
    }).then(({ error }) => {
      if (error) console.error('[Chatwoot Webhook] Failed to increment usage:', error)
    })

    // Record LLM usage in logs asynchronously if usage data exists
    if (llmResponse.usage) {
      supabase.from('llm_usage_logs').insert({
        property_id: propertyId,
        provider: llmResponse.provider,
        model: llmResponse.model,
        input_tokens: llmResponse.usage.inputTokens,
        output_tokens: llmResponse.usage.outputTokens,
        total_tokens: llmResponse.usage.totalTokens,
        year_month: yearMonth
      }).then(({ error }) => {
        if (error) console.error('[Chatwoot Webhook] Failed to save LLM usage log:', error)
      })
    }

    return NextResponse.json({
      status: 'ok',
      provider: llmResponse.provider,
      model: llmResponse.model,
    })
  } catch (error) {
    logger.error('Webhook handler error', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
