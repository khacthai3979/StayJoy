/**
 * IP-based Rate Limiter for Webhook Endpoints
 *
 * Protects against external attackers spamming the webhook endpoint
 * to trigger excessive LLM calls and drain API credits.
 *
 * Configuration:
 *   - Max 60 requests per minute per IP
 *   - Auto-cleanup of stale entries every 5 minutes
 *
 * Usage:
 *   import { checkWebhookRateLimit } from '@/lib/chatbot/webhook-rate-limit'
 *
 *   const ip = request.headers.get('x-forwarded-for') || 'unknown'
 *   const { isLimited, remaining, retryAfterSeconds } = checkWebhookRateLimit(ip)
 */

interface IPRateEntry {
  timestamps: number[]
}

const ipRateMap = new Map<string, IPRateEntry>()

const MAX_REQUESTS_PER_MINUTE = 60
const WINDOW_MS = 60 * 1000 // 1 minute
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// Auto-cleanup stale entries to prevent memory leak
let lastCleanup = Date.now()

function cleanupStaleEntries() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return

  lastCleanup = now
  const cutoff = now - WINDOW_MS

  for (const [ip, entry] of ipRateMap.entries()) {
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff)
    if (entry.timestamps.length === 0) {
      ipRateMap.delete(ip)
    }
  }
}

export interface WebhookRateLimitResult {
  isLimited: boolean
  remaining: number
  retryAfterSeconds?: number
}

/**
 * Checks if an IP address has exceeded the webhook rate limit.
 *
 * @param ip - The IP address to check (from x-forwarded-for or request IP)
 * @returns Object indicating whether the IP is rate limited
 */
export function checkWebhookRateLimit(ip: string): WebhookRateLimitResult {
  cleanupStaleEntries()

  const now = Date.now()
  const windowStart = now - WINDOW_MS

  let entry = ipRateMap.get(ip)
  if (!entry) {
    entry = { timestamps: [] }
    ipRateMap.set(ip, entry)
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart)

  if (entry.timestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    // Calculate how long until the oldest timestamp expires
    const oldestTimestamp = entry.timestamps[0]
    const retryAfterMs = oldestTimestamp + WINDOW_MS - now
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000)

    return {
      isLimited: true,
      remaining: 0,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    }
  }

  // Record this request
  entry.timestamps.push(now)

  return {
    isLimited: false,
    remaining: MAX_REQUESTS_PER_MINUTE - entry.timestamps.length,
  }
}
