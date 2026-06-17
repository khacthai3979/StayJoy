import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import os from 'os'

/**
 * GET /api/health
 *
 * System health check endpoint for Better Stack (Free Tier).
 * Checks connectivity to all critical dependencies:
 *   - Supabase Database
 *   - Chatwoot API
 *   - SMTP Configuration
 *   - System Resources (CPU & RAM)
 *
 * Returns:
 *   - 200 with "healthy"  → all checks pass
 *   - 503 with "degraded" → non-critical checks fail or CPU load > 85% (503 triggers Better Stack Free alert)
 *   - 503 with "unhealthy" → critical checks (DB down) fail or RAM usage > 85%
 *
 * Security:
 *   - Without `X-Health-Secret` header → minimal response (status + timestamp only)
 *   - With valid `X-Health-Secret` header → full response (system metrics + check details)
 *   This prevents attackers from gathering server info via this public endpoint.
 *
 * Intended to be called every 3 minutes by Better Stack.
 *
 * Note: os.loadavg() returns [0, 0, 0] on Windows. CPU metrics are only
 * meaningful when running on Linux (Docker/EC2 production environment).
 */

interface CheckResult {
  status: 'up' | 'down' | 'configured' | 'not_configured'
  latencyMs?: number
  error?: string
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const checks: Record<string, CheckResult> = {}

  // --- Auth: Check if caller has the secret header for detailed response ---
  const healthSecret = process.env.HEALTH_CHECK_SECRET
  const providedSecret = request.headers.get('x-health-secret')
  const isAuthorized = healthSecret && providedSecret === healthSecret

  // --- 1. System Resource Metrics (CPU & RAM) ---
  // Note: os.loadavg() returns [0, 0, 0] on Windows — CPU metrics
  // are only accurate on Linux (Docker/EC2 production).
  let system: {
    cpuCores: number
    cpuLoad1m: number
    cpuUsagePercent: number
    totalMemoryGb: number
    freeMemoryGb: number
    memoryUsagePercent: number
  } | undefined = undefined

  try {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const memoryUsagePercent = parseFloat(((usedMem / totalMem) * 100).toFixed(2))

    const cpus = os.cpus()
    const cpuCores = cpus ? cpus.length : 1
    const loadAvg = os.loadavg() // [1m, 5m, 15m] load
    const cpuLoad1m = loadAvg[0]
    // Estimate CPU usage percentage as (1m load avg / cores) * 100
    const cpuUsagePercent = parseFloat(((cpuLoad1m / cpuCores) * 100).toFixed(2))

    system = {
      cpuCores,
      cpuLoad1m,
      cpuUsagePercent,
      totalMemoryGb: parseFloat((totalMem / (1024 ** 3)).toFixed(2)),
      freeMemoryGb: parseFloat((freeMem / (1024 ** 3)).toFixed(2)),
      memoryUsagePercent,
    }
  } catch (err) {
    // Fallback if OS query fails — system will remain undefined
  }

  // --- 2. Database Check (Supabase) ---
  try {
    const dbStart = Date.now()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    // Simple query to verify connectivity
    const { error } = await supabase
      .from('properties')
      .select('id')
      .limit(1)

    if (error) {
      checks.database = { status: 'down', latencyMs: Date.now() - dbStart, error: error.message }
    } else {
      checks.database = { status: 'up', latencyMs: Date.now() - dbStart }
    }
  } catch (err) {
    checks.database = {
      status: 'down',
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }

  // --- 3. Chatwoot Check ---
  try {
    const cwStart = Date.now()
    const chatwootUrl = process.env.CHATWOOT_URL || 'http://chatwoot-web:3000'
    const res = await fetch(`${chatwootUrl}/auth/sign_in`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000), // 5s timeout
    })
    checks.chatwoot = { status: 'up', latencyMs: Date.now() - cwStart }
  } catch (err) {
    checks.chatwoot = {
      status: 'down',
      error: err instanceof Error ? err.message : 'Connection failed',
    }
  }

  // --- 4. SMTP Configuration Check ---
  const smtpHost = process.env.SMTP_HOST
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASSWORD
  checks.smtp = {
    status: smtpHost && smtpUser && smtpPass ? 'configured' : 'not_configured',
  }

  // --- 5. LLM Provider Check (verify at least one API key exists) ---
  const hasLLMKey = !!(
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY
  )
  checks.llm_provider = {
    status: hasLLMKey ? 'configured' : 'not_configured',
  }

  // --- Determine overall status ---
  const totalResponseTime = Date.now() - startTime
  const dbDown = checks.database?.status === 'down'
  const chatwootDown = checks.chatwoot?.status === 'down'
  
  // Resource status checks (Threshold configured at 85%)
  const isMemoryCritical = system ? system.memoryUsagePercent > 85 : false
  const isCpuCritical = system ? system.cpuUsagePercent > 85 : false

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy'
  let httpStatus: number

  if (dbDown || isMemoryCritical) {
    // Database down or RAM usage > 85% is critical (HTTP 503)
    overallStatus = 'unhealthy'
    httpStatus = 503
  } else if (chatwootDown || isCpuCritical) {
    // Chatwoot down or CPU load > 85% is warning/degraded
    // Forced to HTTP 503 so Better Stack Free Tier triggers an alert
    overallStatus = 'degraded'
    httpStatus = 503
  } else {
    overallStatus = 'healthy'
    httpStatus = 200
  }

  // --- Build response based on authorization ---
  if (isAuthorized) {
    // Full detailed response for authorized callers (Better Stack with secret header)
    return NextResponse.json(
      {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        responseTimeMs: totalResponseTime,
        system,
        checks,
        version: process.env.npm_package_version || '0.1.0',
      },
      { status: httpStatus }
    )
  }

  // Minimal response for public/unauthorized callers
  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
    },
    { status: httpStatus }
  )
}

