'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, Trash2, Bot, User } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

interface ChatTestWidgetProps {
  propertyId: string
}

export function ChatTestWidget({ propertyId: propId }: ChatTestWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'system',
      content: 'Đây là chatbot test. Hãy hỏi thử để kiểm tra knowledge base đã cập nhật đúng chưa.',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [resolvedPropertyId, setResolvedPropertyId] = useState(propId)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Resolve property_id if not provided
  useEffect(() => {
    if (propId) {
      setResolvedPropertyId(propId)
      return
    }
    async function fetchPropertyId() {
      try {
        const res = await fetch('/api/properties/me')
        if (res.ok) {
          const data = await res.json()
          setResolvedPropertyId(data.property_id || data.property?.id || '')
        }
      } catch { /* ignore */ }
    }
    fetchPropertyId()
  }, [propId])

  function scrollToBottom() {
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth',
        })
      }
    }, 100)
  }

  async function handleSend() {
    const question = input.trim()
    if (!question || loading) return

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    scrollToBottom()

    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: resolvedPropertyId, question }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const data = await res.json()

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer || '(Không có câu trả lời)',
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'system',
        content: `❌ Lỗi: ${err instanceof Error ? err.message : 'Không thể kết nối AI'}`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setLoading(false)
      scrollToBottom()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleClear() {
    setMessages([
      {
        id: 'welcome',
        role: 'system',
        content: 'Đã xóa lịch sử. Hỏi lại để test với dữ liệu mới nhất.',
        timestamp: new Date(),
      },
    ])
  }

  return (
    <div className="flex flex-col h-[550px] rounded-2xl border border-border/60 bg-card shadow-lg shadow-black/5 overflow-hidden transition-all duration-300 hover:shadow-xl hover:border-border/80">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-gradient-to-b from-muted/30 to-transparent">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-wide flex items-center gap-1 text-foreground">
              🤖 Test Chatbot
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Kiểm tra dữ liệu huấn luyện (Knowledge Base)
            </p>
          </div>
        </div>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={handleClear}
          className="h-8 px-2.5 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="text-xs font-medium">Xóa chat</span>
        </Button>
      </div>

      {/* Messages */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-slate-50/30 dark:bg-zinc-950/10 scroll-smooth"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in-50 duration-200`}
          >
            {msg.role === 'system' ? (
              <div className="w-full flex justify-center my-1">
                <span className="text-xs text-muted-foreground/90 bg-muted/80 px-3 py-1.5 rounded-full border border-border/30 shadow-sm">
                  {msg.content}
                </span>
              </div>
            ) : (
              <div className={`flex gap-2.5 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-primary/10 border-primary/20 text-primary'
                    : 'bg-indigo-50 border-indigo-100 text-indigo-600 dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-400'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>

                {/* Bubble */}
                <div className="flex flex-col space-y-1">
                  <div
                    className={`rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-tr-none'
                        : 'bg-card text-foreground border border-border/50 rounded-tl-none'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className={`text-[10px] text-muted-foreground/70 px-1 ${
                    msg.role === 'user' ? 'text-right' : 'text-left'
                  }`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex justify-start gap-2.5 max-w-[85%] animate-pulse">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-indigo-100 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-400">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex flex-col space-y-1">
              <div className="bg-card border border-border/50 rounded-2xl rounded-tl-none px-4 py-3 text-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t border-border/50 bg-card">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập câu hỏi thử..."
            disabled={loading}
            className="flex-1 rounded-xl border-border/60 focus-visible:ring-indigo-500 focus-visible:ring-1"
          />
          <Button 
            onClick={handleSend} 
            disabled={loading || !input.trim()}
            className="rounded-xl px-4 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 flex items-center gap-1.5"
          >
            <span className="text-xs font-semibold">Gửi</span>
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
