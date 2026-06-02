import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildSystemMessage, KnowledgeSection, Room } from '@/lib/knowledge-base/builder'
import { callLLM } from '@/lib/llm/provider'
import { debounceMessage } from '@/lib/message-debounce'

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

export async function POST(request: NextRequest) {
  try {
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

    const supabase = createServiceClient()

    // 1. First, lookup property_id from the active channel_mappings table (configured via Admin UI)
    const { data: channelMapping } = await supabase
      .from('channel_mappings')
      .select('property_id, is_active')
      .eq('inbox_id', String(inboxId))
      .maybeSingle()

    let propertyId = ''

    if (channelMapping) {
      if (!channelMapping.is_active) {
        console.log(`[Chatwoot Webhook] Channel for inbox_id=${inboxId} is inactive. Ignored.`)
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
        console.error(`[Chatwoot Webhook] No mapping for inbox_id=${inboxId}`)
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
        .select('plan, expires_at')
        .eq('id', propertyId)
        .single(),
      supabase
        .from('monthly_usages')
        .select('message_count')
        .eq('property_id', propertyId)
        .eq('year_month', yearMonth)
        .maybeSingle()
    ])

    const plan = propertyRes.data?.plan?.toLowerCase() || 'trial'
    const expiresAt = propertyRes.data?.expires_at
    const isExpired = expiresAt ? new Date(expiresAt) < now : false
    const messageCount = usageRes.data?.message_count || 0

    if (isExpired) {
      console.log(`[Chatwoot Webhook] Subscription expired for property=${propertyId}`)
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
    const limit = planLimits[plan] || 1000

    if (messageCount >= limit) {
      console.log(`[Chatwoot Webhook] Quota exceeded for property=${propertyId}, plan=${plan}, count=${messageCount}/${limit}`)
      
      const isTrial = plan === 'trial'
      const exceededMessage = isTrial
        ? `⚠️ Hệ thống tự động: Homestay của bạn đang sử dụng gói dùng thử (TRIAL) và đã sử dụng hết hạn mức 50 tin nhắn miễn phí. Chatbot đã tạm ngưng. Bạn có muốn nâng cấp gói cước hay không? Vui lòng truy cập trang Ví & Thanh toán hoặc liên hệ admin để nâng cấp gói.`
        : `⚠️ Hệ thống tự động: Homestay của bạn đang sử dụng gói ${plan.toUpperCase()} và đã dùng hết giới hạn ${limit} tin nhắn miễn phí của tháng này. Chatbot đã tạm ngưng. Vui lòng chat trực tiếp với khách hoặc nâng cấp gói để tiếp tục sử dụng.`

      await replyToChatwoot(
        accountId, 
        conversationId, 
        exceededMessage,
        'private'
      )
      return NextResponse.json({ status: 'quota_exceeded' })
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

    // Build system message
    let systemMessage = buildSystemMessage(sections, rooms, plan)

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

    // Scan for [SHOW_IMAGES:room_id] tags
    const imageTags = llmResponse.answer.match(/\[SHOW_IMAGES:[^\]]+\]/g) || []

    // Reply to Chatwoot (strip tag before sending to customer)
    const cleanAnswer = llmResponse.answer
      .replace(/\[BOOKING_REQUEST\|[^\]]*\]/g, '')
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
          for (const url of urls) {
            await sendImageToChatwoot(accountId, conversationId, url)
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
        console.error('[Chatwoot Webhook] Failed to create booking request:', bookingError)
      } else {
        // Send private note to owner
        const privateNote = `🔔 YÊU CẦU ĐẶT PHÒNG MỚI:\n👤 Tên: ${fields.ten || 'N/A'}\n📱 SĐT: ${fields.sdt || 'N/A'}\n📅 Check-in: ${fields.checkin || 'N/A'}\n📅 Check-out: ${fields.checkout || 'N/A'}\n🛏️ Phòng: ${fields.phong || 'N/A'}\n👥 Số người: ${fields.songuoi || 'N/A'}\n\n→ Vui lòng liên hệ khách để xác nhận.`
        await replyToChatwoot(accountId, conversationId, privateNote, 'private')
        console.log(`[Chatwoot Webhook] Booking request created for property=${propertyId}`)
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
    console.error('[POST /api/chatwoot/webhook]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
