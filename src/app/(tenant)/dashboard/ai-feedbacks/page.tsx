'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Sparkles, CheckCircle2, MessageSquare, AlertCircle } from 'lucide-react'

interface UnhandledQuestion {
  id: string
  property_id: string
  conversation_id: string
  customer_message: string
  ai_reason: string
  status: 'new' | 'resolved'
  created_at: string
}

export default function AiFeedbacksPage() {
  const [questions, setQuestions] = useState<UnhandledQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    fetchQuestions()
  }, [])

  async function fetchQuestions() {
    setLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return

      const { data: properties } = await supabase
        .from('user_properties')
        .select('property_id')
        .eq('user_id', userData.user.id)
      
      if (!properties || properties.length === 0) return

      const propertyIds = properties.map(p => p.property_id)

      const { data, error } = await supabase
        .from('unhandled_questions')
        .select('*')
        .in('property_id', propertyIds)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        // Table might not exist yet if migration hasn't run
        console.error('Error fetching questions:', error)
        return
      }

      setQuestions(data as UnhandledQuestion[])
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function markAsResolved(id: string) {
    try {
      const { error } = await supabase
        .from('unhandled_questions')
        .update({ status: 'resolved' })
        .eq('id', id)
      
      if (!error) {
        setQuestions(questions.map(q => q.id === id ? { ...q, status: 'resolved' } : q))
      }
    } catch (err) {
      console.error('Error resolving:', err)
    }
  }

  async function analyzeFeedbacks() {
    setAnalyzing(true)
    setAnalysisResult(null)
    try {
      const pendingQuestions = questions.filter(q => q.status === 'new')
      if (pendingQuestions.length === 0) {
        setAnalysisResult('Tuyệt vời! Không có câu hỏi nào đang bị tồn đọng chưa giải quyết.')
        setAnalyzing(false)
        return
      }

      // Format payload for AI
      const payload = pendingQuestions.map(q => `Khách hỏi: "${q.customer_message}" -> Lý do AI không trả lời: "${q.ai_reason}"`).join('\n')

      const res = await fetch('/api/ai/analyze-feedbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload })
      })

      if (!res.ok) throw new Error('API error')
      
      const json = await res.json()
      setAnalysisResult(json.analysis || 'Không thể tổng hợp dữ liệu lúc này.')

    } catch (err) {
      console.error('Analysis error:', err)
      setAnalysisResult('Đã xảy ra lỗi khi gọi AI phân tích. Vui lòng thử lại sau.')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cải Thiện Chatbot</h1>
          <p className="text-muted-foreground mt-2">
            Nơi ghi nhận các tin nhắn mà AI không thể trả lời được. Dùng AI để phân tích và tối ưu hóa Dữ liệu học (Knowledge Base).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Analysis Card */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-primary/50 shadow-md">
            <CardHeader className="bg-primary/5 pb-4">
              <CardTitle className="flex items-center gap-2 text-primary">
                <Sparkles className="h-5 w-5" />
                Đánh Giá Thông Minh
              </CardTitle>
              <CardDescription>
                AI sẽ đọc các câu hỏi chưa xử lý bên cạnh và gợi ý cho bạn cách viết thêm thông tin vào Knowledge Base.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Button 
                className="w-full mb-4" 
                size="lg" 
                onClick={analyzeFeedbacks}
                disabled={analyzing}
              >
                {analyzing ? 'Đang phân tích dữ liệu...' : '✨ Bắt Đầu Phân Tích'}
              </Button>

              {analysisResult && (
                <div className="mt-4 p-4 bg-muted rounded-lg border text-sm leading-relaxed whitespace-pre-wrap">
                  {analysisResult}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Questions Table */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                Danh sách câu hỏi cần hỗ trợ
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center p-8 text-muted-foreground">Đang tải dữ liệu...</div>
              ) : questions.length === 0 ? (
                <div className="text-center flex flex-col items-center justify-center p-12 border border-dashed rounded-lg">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-4" />
                  <p className="text-lg font-medium">Hoàn hảo!</p>
                  <p className="text-muted-foreground">Hiện không có câu hỏi nào làm khó được Chatbot của bạn.</p>
                </div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nội dung khách hỏi</TableHead>
                        <TableHead>Lý do (AI báo cáo)</TableHead>
                        <TableHead className="w-[100px]">Trạng thái</TableHead>
                        <TableHead className="text-right">Hành động</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {questions.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell className="font-medium max-w-[200px] truncate" title={q.customer_message}>
                            {q.customer_message}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate" title={q.ai_reason}>
                            {q.ai_reason}
                          </TableCell>
                          <TableCell>
                            {q.status === 'new' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                                <AlertCircle className="h-3 w-3" /> Chờ xử lý
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                                <CheckCircle2 className="h-3 w-3" /> Đã xong
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {q.status === 'new' && (
                              <Button variant="ghost" size="sm" onClick={() => markAsResolved(q.id)}>
                                Xong
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
