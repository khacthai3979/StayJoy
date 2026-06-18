/**
 * Message Debounce — Gom nhiều tin nhắn liên tiếp từ cùng 1 conversation
 * thành 1 message duy nhất trước khi gọi LLM.
 *
 * Vấn đề: Khách nhắn kiểu:
 *   "xin thông tin"
 *   "cho em xem hình"
 *   "giá bao nhiêu"
 * → Chatwoot gửi 3 webhook → 3 LLM calls → 3 replies (lãng phí + confusing)
 *
 * Giải pháp: Chờ DEBOUNCE_MS sau tin nhắn cuối cùng, gom tất cả thành 1 string.
 *
 * Flow:
 *   msg1 arrives → start timer (30s)
 *   msg2 arrives (1s later) → reset timer (30s from now)
 *   msg3 arrives (0.5s later) → reset timer (30s from now)
 *   ... 30s passes with no new message ...
 *   → combine: "xin thông tin\ncho em xem hình\ngiá bao nhiêu"
 *   → call LLM once → 1 comprehensive reply
 */

const DEBOUNCE_MS = 30000 // Chờ 30 giây sau tin nhắn cuối

interface PendingMessage {
  messages: string[]
  timer: ReturnType<typeof setTimeout>
  resolve: (combined: string) => void
}

// In-memory store keyed by conversation_id
const pending = new Map<string, PendingMessage>()

/**
 * Debounce a message for a given conversation.
 *
 * Returns a Promise that resolves with the combined message string
 * after DEBOUNCE_MS of inactivity.
 *
 * If this is a "follow-up" message (conversation already has pending messages),
 * returns null — meaning the caller should NOT process this request
 * (the first caller's promise will resolve with all messages combined).
 */
export function debounceMessage(
  conversationId: string,
  message: string
): Promise<string> | null {
  const existing = pending.get(conversationId)

  if (existing) {
    // Append message and reset timer
    existing.messages.push(message)
    clearTimeout(existing.timer)
    existing.timer = setTimeout(() => {
      const combined = existing.messages.join('\n')
      pending.delete(conversationId)
      existing.resolve(combined)
    }, DEBOUNCE_MS)

    // Return null — this caller should skip processing
    return null
  }

  // First message in this batch — create a new pending entry
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => {
      const entry = pending.get(conversationId)
      if (entry) {
        const combined = entry.messages.join('\n')
        pending.delete(conversationId)
        resolve(combined)
      }
    }, DEBOUNCE_MS)

    pending.set(conversationId, {
      messages: [message],
      timer,
      resolve,
    })
  })
}

/**
 * Check if a conversation has pending (debouncing) messages.
 */
export function hasPending(conversationId: string): boolean {
  return pending.has(conversationId)
}

/**
 * Cancel pending debounce for a conversation (e.g., on error).
 */
export function cancelPending(conversationId: string): void {
  const entry = pending.get(conversationId)
  if (entry) {
    clearTimeout(entry.timer)
    pending.delete(conversationId)
    // Resolve with an empty string so waiting promises exit safely
    entry.resolve('')
  }
}
