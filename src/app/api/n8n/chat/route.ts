import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { callLLM } from '@/lib/llm/provider'
import { buildSystemMessage, KnowledgeSection, Room } from '@/lib/knowledge-base/builder'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('X-API-Key')
  return apiKey === process.env.KNOWLEDGE_BASE_API_KEY
}

/**
 * POST /api/n8n/chat
 *
 * Unified LLM endpoint for n8n — replaces AI Agent + OpenAI Chat Model nodes.
 * n8n sends user message + inbox_id, this endpoint:
 *   1. Resolves property_id from inbox_id
 *   2. Builds system message from knowledge base
 *   3. Calls LLM with property-specific config (or global fallback)
 *   4. Returns AI response
 *
 * Auth: X-API-Key header
 *
 * Request body:
 *   - inbox_id: string (Chatwoot inbox ID to resolve property)
 *   - message: string (user message)
 *   - conversation_id?: string (for logging/context)
 *   - property_id?: string (direct property_id, skips inbox lookup)
 *
 * Response:
 *   - answer: string (AI response text)
 *   - provider: string (which LLM provider was used)
 *   - model: string (which model was used)
 *   - property_id: string
 */
export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { inbox_id, message, property_id: directPropertyId } = body

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    if (!inbox_id && !directPropertyId) {
      return NextResponse.json({ error: 'inbox_id or property_id is required' }, { status: 400 })
    }

    const supabase = createServiceClient()
    let propertyId = directPropertyId

    // Resolve property_id from inbox_id if not provided directly
    if (!propertyId && inbox_id) {
      const { data: mapping, error: mappingError } = await supabase
        .from('chatwoot_inbox_mapping')
        .select('property_id')
        .eq('inbox_id', String(inbox_id))
        .single()

      if (mappingError || !mapping) {
        return NextResponse.json({ error: 'Inbox not found' }, { status: 404 })
      }
      propertyId = mapping.property_id
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

    if (sectionsResult.error) throw sectionsResult.error
    if (roomsResult.error) throw roomsResult.error

    const sections: KnowledgeSection[] = sectionsResult.data ?? []
    const rooms: Room[] = roomsResult.data ?? []
    const roomImages = imagesResult.data ?? []

    // Build system message
    let systemMessage = buildSystemMessage(sections, rooms)

    // Append image instruction if rooms have images
    if (roomImages.length > 0) {
      const imagesByRoom: Record<string, string[]> = {}
      for (const img of roomImages) {
        if (!imagesByRoom[img.room_id]) imagesByRoom[img.room_id] = []
        imagesByRoom[img.room_id].push(img.image_url)
      }

      const roomsWithImages = Object.keys(imagesByRoom)
      const imageInstruction = [
        '\n\n---\n\n## Hướng Dẫn Gửi Hình Phòng',
        '',
        'Khi khách hỏi xem hình phòng, hãy trả lời bình thường và thêm tag [SHOW_IMAGES:room_id] vào cuối câu trả lời.',
        `Các phòng có hình: ${roomsWithImages.join(', ')}`,
        '',
        'Ví dụ: "Đây là phòng đôi của chúng tôi, rất thoáng mát ạ. [SHOW_IMAGES:P101]"',
        'Nếu khách hỏi xem tất cả phòng, gửi nhiều tag: [SHOW_IMAGES:P101] [SHOW_IMAGES:P102]',
        'Chỉ dùng tag cho phòng có trong danh sách trên.',
      ].join('\n')

      systemMessage += imageInstruction
    }

    // Call LLM with property-specific config
    const llmResponse = await callLLM(
      { systemMessage, userMessage: message },
      propertyId
    )

    return NextResponse.json({
      answer: llmResponse.answer,
      provider: llmResponse.provider,
      model: llmResponse.model,
      property_id: propertyId,
      // Include room_images for n8n to parse SHOW_IMAGES tags
      room_images: roomImages.length > 0
        ? roomImages.reduce((acc, img) => {
            if (!acc[img.room_id]) acc[img.room_id] = []
            acc[img.room_id].push(img.image_url)
            return acc
          }, {} as Record<string, string[]>)
        : undefined,
    })
  } catch (error) {
    console.error('[POST /api/n8n/chat]', error)
    const msg = error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
