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

    const systemMessage = `Bạn là chuyên gia phân tích dữ liệu chatbot phục vụ ngành khách sạn/homestay. 
Nhiệm vụ của bạn là đọc các câu hỏi mà chatbot hiện tại không trả lời được (do thiếu thông tin), gom nhóm chúng lại và đưa ra lời khuyên thiết thực cho chủ nhà.

Vui lòng trình bày theo cấu trúc sau (dùng Markdown):
### 1. Phân Tích Chủ Đề
- (Liệt kê và gom nhóm các vấn đề khách hay hỏi nhất)

### 2. Lỗ Hổng Kiến Thức (Knowledge Gap)
- (Chỉ ra Dữ liệu học / Knowledge Base đang thiếu những thông tin gì dựa trên các câu hỏi trên)

### 3. Đề Xuất Cập Nhật
- (Viết sẵn một vài đoạn văn mẫu ngắn gọn để chủ nhà có thể copy-paste thẳng vào Knowledge Base)`

    const userMessage = `Dưới đây là danh sách các tin nhắn khách hỏi mà chatbot đã phải chuyển giao cho chủ nhà:\n\n${data}\n\nHãy tổng hợp và đưa ra báo cáo.`

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
