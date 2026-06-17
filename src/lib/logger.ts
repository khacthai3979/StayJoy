/**
 * Structured Logger Module for StayJoy
 *
 * Provides consistent, structured logging across the application.
 * - Production: JSON format (easy to parse by CloudWatch/ELK/Sentry)
 * - Development: Human-readable format
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info('Message processed', { propertyId: '...', conversationId: 123 })
 *   logger.error('LLM call failed', { provider: 'openrouter', error: err.message })
 */

type LogLevel = 'info' | 'warn' | 'error'

interface LogContext {
  propertyId?: string
  conversationId?: number | string
  inboxId?: number | string
  provider?: string
  model?: string
  [key: string]: unknown
}

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  service: string
  context?: LogContext
}

const SERVICE_NAME = 'stayjoy'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function formatLogEntry(entry: LogEntry): string {
  if (IS_PRODUCTION) {
    // JSON format for production log aggregation
    return JSON.stringify(entry)
  }

  // Human-readable format for development
  const ctx = entry.context
    ? ` | ${Object.entries(entry.context)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`
    : ''
  const levelIcon = entry.level === 'error' ? '❌' : entry.level === 'warn' ? '⚠️' : 'ℹ️'
  return `${levelIcon} [${entry.level.toUpperCase()}] ${entry.message}${ctx}`
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  }

  const formatted = formatLogEntry(entry)

  switch (level) {
    case 'error':
      console.error(formatted)
      break
    case 'warn':
      console.warn(formatted)
      break
    default:
      console.log(formatted)
  }
}

export const logger = {
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
}
