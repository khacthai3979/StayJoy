import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callLLM } from '@/lib/llm/provider'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()

    // Validate Supabase session
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { data } = body

    if (!data || typeof data !== 'string') {
      return NextResponse.json({ error: 'data payload is required' }, { status: 400 })
    }

    const systemMessage = `Dựa vào những câu hỏi khách hàng vừa hỏi, hãy viết MỘT câu trả lời chung hoặc quy định ngắn gọn nhất có thể để chủ nhà copy dán ngay vào Knowledge Base. 
Tuyệt đối KHÔNG viết phân tích dài dòng. KHÔNG chào hỏi. Đi thẳng vào nội dung chính.`

    const userMessage = `Danh sách câu hỏi chưa trả lời được:\n\n${data}`

    // Call LLM
    const llmResponse = await callLLM({
      systemMessage,
      userMessage,
    })

    return NextResponse.json({
      analysis: llmResponse.answer,
    })
  } catch (error) {
    console.error('[POST /api/ai/analyze-feedbacks] Error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
