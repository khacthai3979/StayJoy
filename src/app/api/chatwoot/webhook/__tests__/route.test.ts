import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// --- Mock environment variables ---
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
vi.stubEnv('CHATWOOT_URL', 'http://chatwoot-web:3000')
vi.stubEnv('CHATWOOT_BOT_TOKEN', 'test-bot-token')

// --- Mock Supabase ---
const mockFrom = vi.fn()
const mockRpc = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
    auth: {
      admin: {
        getUserById: (...args: any[]) => mockGetUser(...args),
      },
    },
  })),
}))

// --- Mock LLM provider ---
const mockCallLLM = vi.fn()
vi.mock('@/lib/llm/provider', () => ({
  callLLM: (...args: any[]) => mockCallLLM(...args),
}))

// --- Mock debounce ---
vi.mock('@/lib/message-debounce', () => ({
  debounceMessage: vi.fn((_convId: string, content: string) => Promise.resolve(content)),
}))

// --- Mock email service ---
const mockSendEmail = vi.fn().mockResolvedValue(true)
vi.mock('@/lib/email', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}))

// --- Mock global fetch ---
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { POST } from '../route'

describe('Chatwoot Webhook Route - History Order Handling & Email Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Create chainable mock builder
    const createQueryBuilderMock = (data: any = null, error: any = null) => {
      const builder: any = {
        select: vi.fn().mockImplementation(() => builder),
        insert: vi.fn().mockImplementation(() => Promise.resolve({ data, error })),
        update: vi.fn().mockImplementation(() => builder),
        delete: vi.fn().mockImplementation(() => builder),
        eq: vi.fn().mockImplementation(() => builder),
        single: vi.fn().mockImplementation(() => Promise.resolve({ data, error })),
        maybeSingle: vi.fn().mockImplementation(() => Promise.resolve({ data, error })),
        order: vi.fn().mockImplementation(() => builder),
        then: (onfulfilled: any) => Promise.resolve({ data, error }).then(onfulfilled),
      }
      return builder
    }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'channel_mappings') {
        return createQueryBuilderMock({ property_id: 'prop-123', is_active: true })
      }
      if (table === 'properties') {
        return createQueryBuilderMock({ plan: 'trial', expires_at: null, telegram_chat_id: null })
      }
      if (table === 'monthly_usages') {
        return createQueryBuilderMock({ message_count: 0 })
      }
      if (table === 'knowledge_base_sections') {
        return createQueryBuilderMock([])
      }
      if (table === 'rooms') {
        return createQueryBuilderMock([])
      }
      if (table === 'room_images') {
        return createQueryBuilderMock([])
      }
      if (table === 'users_properties') {
        return createQueryBuilderMock({ user_id: 'user-456' })
      }
      return createQueryBuilderMock(null)
    })

    mockRpc.mockReturnValue(Promise.resolve({ error: null }))

    mockGetUser.mockResolvedValue({
      data: { user: { email: 'owner@test.com' } },
      error: null,
    })

    // Mock successful LLM call
    mockCallLLM.mockResolvedValue({
      answer: 'Xin chào! Em có thể giúp gì cho anh/chị?',
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    })
  })

  function createWebhookPayload(content: string) {
    return {
      event: 'message_created',
      message_type: 'incoming',
      content: content,
      conversation: {
        id: 42,
        inbox_id: 1,
        status: 'open',
      },
      account: {
        id: 1,
      },
    }
  }

  it('correctly processes and orders conversation history when Chatwoot returns messages in DESCENDING order (newest first)', async () => {
    // Mock fetch for getConversationHistory and Chatwoot reply
    mockFetch.mockImplementation((url: string, options: any) => {
      if (url.endsWith('/messages') && options.method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            payload: [
              {
                id: 103,
                content: '2',
                message_type: 0, // customer
                private: false,
                created_at: 1780800120, // newest (2)
              },
              {
                id: 102,
                content: 'Dạ, anh/chị đi mấy người ạ?',
                message_type: 1, // bot
                private: false,
                created_at: 1780800060, // second newest
              },
              {
                id: 101,
                content: 'ngày 7/6 đến 9/6',
                message_type: 0, // customer
                private: false,
                created_at: 1780800000, // oldest
              },
            ]
          }),
        })
      }
      return Promise.resolve({ ok: true })
    })

    const req = new NextRequest('http://localhost:3000/api/chatwoot/webhook', {
      method: 'POST',
      body: JSON.stringify(createWebhookPayload('2')),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    expect(mockCallLLM).toHaveBeenCalled()
    const firstCallArgs = mockCallLLM.mock.calls[0][0]
    
    expect(firstCallArgs.systemMessage).toContain(
      'Khách: "ngày 7/6 đến 9/6"\nLễ tân AI: "Dạ, anh/chị đi mấy người ạ?"'
    )
    expect(firstCallArgs.userMessage).toBe('2')
  })

  it('correctly processes and orders conversation history when Chatwoot returns messages in ASCENDING order (oldest first)', async () => {
    mockFetch.mockImplementation((url: string, options: any) => {
      if (url.endsWith('/messages') && options.method === 'GET') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            payload: [
              {
                id: 101,
                content: 'ngày 7/6 đến 9/6',
                message_type: 0, // customer
                private: false,
                created_at: 1780800000, // oldest
              },
              {
                id: 102,
                content: 'Dạ, anh/chị đi mấy người ạ?',
                message_type: 1, // bot
                private: false,
                created_at: 1780800060, // second newest
              },
              {
                id: 103,
                content: '2',
                message_type: 0, // customer
                private: false,
                created_at: 1780800120, // newest (2)
              },
            ]
          }),
        })
      }
      return Promise.resolve({ ok: true })
    })

    const req = new NextRequest('http://localhost:3000/api/chatwoot/webhook', {
      method: 'POST',
      body: JSON.stringify(createWebhookPayload('2')),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    expect(mockCallLLM).toHaveBeenCalled()
    const firstCallArgs = mockCallLLM.mock.calls[0][0]
    
    expect(firstCallArgs.systemMessage).toContain(
      'Khách: "ngày 7/6 đến 9/6"\nLễ tân AI: "Dạ, anh/chị đi mấy người ạ?"'
    )
    expect(firstCallArgs.userMessage).toBe('2')
  })

  it('sends email and creates private note when a BOOKING_REQUEST is detected', async () => {
    mockCallLLM.mockResolvedValue({
      answer: 'Dạ em đã ghi nhận yêu cầu [BOOKING_REQUEST|ten=Nguyen Van A|sdt=0909123456|checkin=2026-06-15|checkout=2026-06-17|phong=Phong Doi|songuoi=2]',
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    })

    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ payload: [] }) })

    const req = new NextRequest('http://localhost:3000/api/chatwoot/webhook', {
      method: 'POST',
      body: JSON.stringify(createWebhookPayload('Tôi muốn đặt phòng')),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    // Verify database insert of booking request
    expect(mockFrom).toHaveBeenCalledWith('bookings')

    // Verify Chatwoot reply to customer (stripped of tags)
    const replyCall = mockFetch.mock.calls.find(call => 
      call[0].includes('/messages') && 
      call[1].method === 'POST' && 
      JSON.parse(call[1].body).message_type === 'outgoing' &&
      !JSON.parse(call[1].body).private
    )
    expect(replyCall).toBeDefined()
    expect(JSON.parse(replyCall![1].body).content).toBe('Dạ em đã ghi nhận yêu cầu')

    // Verify private note
    const privateNoteCall = mockFetch.mock.calls.find(call => 
      call[0].includes('/messages') && 
      call[1].method === 'POST' && 
      JSON.parse(call[1].body).private === true
    )
    expect(privateNoteCall).toBeDefined()
    expect(JSON.parse(privateNoteCall![1].body).content).toContain('YÊU CẦU ĐẶT PHÒNG MỚI')

    // Verify email was sent to the owner
    expect(mockGetUser).toHaveBeenCalledWith('user-456')
    expect(mockSendEmail).toHaveBeenCalled()
    const emailArgs = mockSendEmail.mock.calls[0]
    expect(emailArgs[0]).toBe('owner@test.com')
    expect(emailArgs[1]).toContain('Yêu cầu đặt phòng mới')
    expect(emailArgs[2]).toContain('Nguyen Van A')
  })

  it('sends email and creates private note when a OWNER_REQUEST is detected', async () => {
    mockCallLLM.mockResolvedValue({
      answer: 'Dạ, em sẽ báo chủ nhà hỗ trợ ngay ạ! [OWNER_REQUEST|message=Khách muốn xin check-in sớm lúc 8h sáng]',
      provider: 'gemini',
      model: 'gemini-2.5-flash-lite',
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    })

    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ payload: [] }) })

    const req = new NextRequest('http://localhost:3000/api/chatwoot/webhook', {
      method: 'POST',
      body: JSON.stringify(createWebhookPayload('Cho tôi check-in sớm lúc 8h sáng nhé')),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    // Verify Chatwoot reply to customer (stripped of OWNER_REQUEST tags)
    const replyCall = mockFetch.mock.calls.find(call => 
      call[0].includes('/messages') && 
      call[1].method === 'POST' && 
      JSON.parse(call[1].body).message_type === 'outgoing' &&
      !JSON.parse(call[1].body).private
    )
    expect(replyCall).toBeDefined()
    expect(JSON.parse(replyCall![1].body).content).toBe('Dạ, em sẽ báo chủ nhà hỗ trợ ngay ạ!')

    // Verify Chatwoot private note is sent
    const privateNoteCall = mockFetch.mock.calls.find(call => 
      call[0].includes('/messages') && 
      call[1].method === 'POST' && 
      JSON.parse(call[1].body).private === true
    )
    expect(privateNoteCall).toBeDefined()
    expect(JSON.parse(privateNoteCall![1].body).content).toContain('KHÁCH HÀNG CẦN HỖ TRỢ')
    expect(JSON.parse(privateNoteCall![1].body).content).toContain('Khách muốn xin check-in sớm lúc 8h sáng')

    // Verify email was sent to the owner
    expect(mockGetUser).toHaveBeenCalledWith('user-456')
    expect(mockSendEmail).toHaveBeenCalled()
    const emailArgs = mockSendEmail.mock.calls[0]
    expect(emailArgs[0]).toBe('owner@test.com')
    expect(emailArgs[1]).toContain('Khách hàng yêu cầu hỗ trợ trực tiếp')
    expect(emailArgs[2]).toContain('Khách muốn xin check-in sớm lúc 8h sáng')
  })
})
