// src/lib/chatbot/moderation.ts
//
// Safe frequency rate limiter and pattern moderation for Chatbot messages.
// Fixed Unicode word boundary issue using space-padding string matchers.

interface RateLimitHistory {
  timestamps: number[]
  lastWarningAt?: number
}

const rateLimitMinute = new Map<string, RateLimitHistory>()
const rateLimitHour = new Map<string, RateLimitHistory>()

const MAX_MSG_PER_MINUTE = 10
const MAX_MSG_PER_HOUR = 60

/**
 * Checks if a conversation has exceeded message frequency limits.
 * 
 * @param conversationId - The unique ID of the Chatwoot conversation.
 */
export function checkRateLimit(conversationId: string): { isLimited: boolean; shouldWarn: boolean; reason?: string } {
  const now = Date.now()
  const oneMinuteAgo = now - 60 * 1000
  const oneHourAgo = now - 60 * 60 * 1000

  // 1. Minute check
  let minHistory = rateLimitMinute.get(conversationId)
  if (!minHistory) {
    minHistory = { timestamps: [] }
    rateLimitMinute.set(conversationId, minHistory)
  }
  minHistory.timestamps = minHistory.timestamps.filter((t) => t > oneMinuteAgo)
  if (minHistory.timestamps.length >= MAX_MSG_PER_MINUTE) {
    let shouldWarn = false
    if (!minHistory.lastWarningAt || (now - minHistory.lastWarningAt > 60 * 1000)) {
      shouldWarn = true
      minHistory.lastWarningAt = now
    }
    return { isLimited: true, shouldWarn, reason: 'minute_limit' }
  }

  // 2. Hour check
  let hrHistory = rateLimitHour.get(conversationId)
  if (!hrHistory) {
    hrHistory = { timestamps: [] }
    rateLimitHour.set(conversationId, hrHistory)
  }
  hrHistory.timestamps = hrHistory.timestamps.filter((t) => t > oneHourAgo)
  if (hrHistory.timestamps.length >= MAX_MSG_PER_HOUR) {
    let shouldWarn = false
    if (!hrHistory.lastWarningAt || (now - hrHistory.lastWarningAt > 60 * 60 * 1000)) {
      shouldWarn = true
      hrHistory.lastWarningAt = now
    }
    return { isLimited: true, shouldWarn, reason: 'hour_limit' }
  }

  // Record timestamp if not limited
  minHistory.timestamps.push(now)
  hrHistory.timestamps.push(now)

  return { isLimited: false, shouldWarn: false }
}

// Precise vulgar words list used with space-padded matching to avoid substring matches.
const VULGAR_WORDS = [
  // 1. Abbreviation & text-style (no accents, safe from false positives)
  'đm', 'đcm', 'dcm', 'vcl', 'vkl', 'clm', 'clgt',
  
  // 2. Vulgar words that are safe to check with/without accents (no overlap with standard vocabulary)
  'đéo', 'deo', 'địt', 'dit', 'chịch', 'chich', 'phịch', 'phich',
  
  // 3. Toxic phrases/insults
  'óc chó', 'oc cho', 'súc vật', 'suc vat', 'đồ ngu', 'do ngu', 'chó đẻ', 'cho de',
  
  // 4. Words that MUST have accents to be matched (prevents false positives on common words: đi, các, phở, lon)
  'cặc', 'lồn', 'buồi', 'đĩ', 'phò', 'ngu lồn',
  
  // 5. English vulgar words
  'fuck', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'bastard', 'cunt', 'motherfucker'
]

/**
 * Normalizes punctuation, pads with spaces, and matches exact words/phrases.
 * Prevents false positives such as matching "phòng" as "phò" or "đi" as "đĩ".
 */
export function checkInappropriateLanguage(content: string): boolean {
  // 1. Remove obfuscation marks inside words (e.g. d.m -> dm, f.u.c.k -> fuck)
  let cleaned = content.toLowerCase()
    .replace(/[.\-_*]/g, '')

  // 2. Replace all remaining punctuation symbols with spaces
  cleaned = cleaned.replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/g, ' ')

  // 3. Pad with spaces
  const padded = ` ${cleaned.replace(/\s+/g, ' ')} `

  // 4. Match exact words using space padding
  return VULGAR_WORDS.some((word) => padded.includes(` ${word} `))
}

// Normalized jailbreak patterns matching exact phrase contexts with spaces and wildcard support
const JAILBREAK_PATTERNS = [
  /quen .*lenh/i,
  /bo qua .*yeu cau/i,
  /bo qua .*huong dan/i,
  /hay dong vai/i,
  /dong vai lam/i,
  /ignore .*instruction/i,
  /forget .*instruction/i,
  /system prompt/i,
  /reveal prompt/i,
  /tiet lo prompt/i,
  /tiet lo .*huong dan/i
]

/**
 * Normalizes text to lowercase accentless with spaces, then tests against jailbreak signatures.
 */
export function checkJailbreak(content: string): boolean {
  const normalized = content.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove Vietnamese accents
    .replace(/[^a-z0-9\s]/g, '') // keep alphanumeric and spaces
    .replace(/\s+/g, ' ') // collapse multiple spaces
    .trim()

  return JAILBREAK_PATTERNS.some((pattern) => pattern.test(normalized))
}
