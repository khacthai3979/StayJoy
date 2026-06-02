import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { estimateCost } from '@/lib/llm/pricing'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Get the property linked to the current user
    const { data: propertyData, error: propError } = await supabase
      .from('users_properties')
      .select('property_id')
      .eq('user_id', session.user.id)
      .single()

    if (propError || !propertyData) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const propertyId = propertyData.property_id

    // 2. Check current quota and plan limits
    const now = new Date()
    const currentYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const [propertyRes, usageRes] = await Promise.all([
      supabase
        .from('properties')
        .select('plan, expires_at')
        .eq('id', propertyId)
        .single(),
      supabase
        .from('monthly_usages')
        .select('message_count')
        .eq('property_id', propertyId)
        .eq('year_month', currentYearMonth)
        .maybeSingle()
    ])

    const plan = propertyRes.data?.plan?.toLowerCase() || 'trial'
    const isExpired = propertyRes.data?.expires_at ? new Date(propertyRes.data.expires_at) < now : false
    const planStatus = isExpired ? 'expired' : 'active'
    const messageCount = usageRes.data?.message_count || 0

    const planLimits: Record<string, number> = {
      'trial': 50,
      'lite': 1000,
      'pro': 2500,
      'premium': 4000
    }
    const limit = planLimits[plan] || 1000
    const remaining = Math.max(0, limit - messageCount)

    // 3. Fetch past 6 months message counts
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
    
    const monthsList: string[] = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth() + i, 1)
      monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    const { data: pastUsages } = await supabase
      .from('monthly_usages')
      .select('year_month, message_count')
      .eq('property_id', propertyId)
      .in('year_month', monthsList)

    // Map monthly usages to order by month chronological
    const usageByMonth = pastUsages?.reduce((acc, curr) => {
      acc[curr.year_month] = curr.message_count
      return acc
    }, {} as Record<string, number>) || {}

    // 4. Fetch past 6 months LLM usage logs for aggregation
    const { data: logs } = await supabase
      .from('llm_usage_logs')
      .select('year_month, model, input_tokens, output_tokens')
      .eq('property_id', propertyId)
      .in('year_month', monthsList)

    // Group logs by month
    const tokenUsageByMonth = logs?.reduce((acc, log) => {
      const month = log.year_month
      if (!acc[month]) {
        acc[month] = { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 }
      }
      const cost = estimateCost(log.model, log.input_tokens, log.output_tokens)
      acc[month].inputTokens += log.input_tokens
      acc[month].outputTokens += log.output_tokens
      acc[month].totalTokens += (log.input_tokens + log.output_tokens)
      acc[month].cost += cost
      return acc
    }, {} as Record<string, { inputTokens: number; outputTokens: number; totalTokens: number; cost: number }>) || {}

    // Build chronological historical data array
    const history = monthsList.map(month => {
      const tokens = tokenUsageByMonth[month] || { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 }
      return {
        month, // 'YYYY-MM'
        messages: usageByMonth[month] || 0,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        totalTokens: tokens.totalTokens,
        estimatedCost: tokens.cost
      }
    })

    // 5. Fetch recent detailed logs (limit 15) for current user to audit
    const { data: recentLogs } = await supabase
      .from('llm_usage_logs')
      .select('model, provider, input_tokens, output_tokens, total_tokens, created_at')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(15)

    const formattedRecentLogs = recentLogs?.map(log => ({
      model: log.model,
      provider: log.provider,
      inputTokens: log.input_tokens,
      outputTokens: log.output_tokens,
      totalTokens: log.total_tokens,
      createdAt: log.created_at,
      cost: estimateCost(log.model, log.input_tokens, log.output_tokens)
    })) || []

    return NextResponse.json({
      plan: plan.toUpperCase(),
      planStatus,
      limit,
      used: messageCount,
      remaining,
      history,
      recentLogs: formattedRecentLogs
    })

  } catch (error) {
    console.error('[GET /api/dashboard/usage]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
