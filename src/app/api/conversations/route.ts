import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const CHATWOOT_BASE = process.env.CHATWOOT_BASE_URL!
const CHATWOOT_ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID!
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN!

async function chatwootFetch(path: string) {
  const res = await fetch(`${CHATWOOT_BASE}/api/v1/accounts/${CHATWOOT_ACCOUNT}${path}`, {
    headers: { 'api_access_token': CHATWOOT_TOKEN },
    next: { revalidate: 60 },
  })
  if (!res.ok) throw new Error(`Chatwoot error: ${res.status}`)
  return res.json()
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get property's inbox_id from chatwoot_inbox_mapping
  const { data: userProp } = await supabase
    .from('users_properties')
    .select('property_id')
    .eq('user_id', user.id)
    .single()

  if (!userProp) return NextResponse.json({ error: 'No property' }, { status: 403 })

  // 1. Get mapped inbox_ids from active channel_mappings
  const { data: channels } = await supabase
    .from('channel_mappings')
    .select('inbox_id')
    .eq('property_id', userProp.property_id)
    .eq('is_active', true)

  const inboxIds: string[] = (channels || [])
    .map(c => c.inbox_id)
    .filter((id): id is string => typeof id === 'string' && id.trim() !== '')

  // 2. Fallback to legacy chatwoot_inbox_mapping if no channels found
  if (inboxIds.length === 0) {
    const { data: legacyMapping } = await supabase
      .from('chatwoot_inbox_mapping')
      .select('inbox_id')
      .eq('property_id', userProp.property_id)
      .maybeSingle()

    if (legacyMapping?.inbox_id) {
      inboxIds.push(legacyMapping.inbox_id)
    }
  }

  // 3. Early exit if no inboxes are mapped to this property
  if (inboxIds.length === 0) {
    return NextResponse.json({
      conversations: [],
      meta: {
        all_count: 0,
        open_count: 0,
        resolved_count: 0,
      },
      stats: {
        total: 0,
        open: 0,
        resolved: 0,
        thisMonth: 0,
      },
    })
  }

  const { searchParams } = new URL(request.url)
  const page = searchParams.get('page') || '1'
  const status = searchParams.get('status') || 'all'

  let allConversations: any[] = []
  let totalAllCount = 0
  let totalOpenCount = 0
  let totalResolvedCount = 0

  try {
    const results = await Promise.all(
      inboxIds.map(async (inboxId) => {
        const inboxFilter = `&inbox_id=${inboxId}`
        if (status === 'all') {
          const [openData, pendingData, resolvedData] = await Promise.all([
            chatwootFetch(`/conversations?page=${page}${inboxFilter}&status=open`),
            chatwootFetch(`/conversations?page=${page}${inboxFilter}&status=pending`),
            chatwootFetch(`/conversations?page=${page}${inboxFilter}&status=resolved`),
          ])

          const openConvs = openData.data?.payload || []
          const pendingConvs = pendingData.data?.payload || []
          const resolvedConvs = resolvedData.data?.payload || []

          return {
            convs: [...pendingConvs, ...openConvs, ...resolvedConvs],
            all_count: (openData.data?.meta?.all_count || 0) + (pendingData.data?.meta?.all_count || 0) + (resolvedData.data?.meta?.all_count || 0),
            open_count: openData.data?.meta?.all_count || 0,
            resolved_count: resolvedData.data?.meta?.all_count || 0,
          }
        } else {
          const data = await chatwootFetch(
            `/conversations?page=${page}${inboxFilter}&status=${status}`
          )
          const convs = data.data?.payload || []
          const count = data.data?.meta?.all_count || 0
          return {
            convs,
            all_count: count,
            open_count: status === 'open' ? count : 0,
            resolved_count: status === 'resolved' ? count : 0,
          }
        }
      })
    )

    // Merge results
    for (const r of results) {
      allConversations.push(...r.convs)
      totalAllCount += r.all_count
      totalOpenCount += r.open_count
      totalResolvedCount += r.resolved_count
    }

    // Sort combined conversations by last_activity_at descending
    allConversations.sort((a, b) => b.last_activity_at - a.last_activity_at)

  } catch (err) {
    console.error('[GET /api/conversations] Chatwoot fetch failed:', err)
    return NextResponse.json({ error: 'Failed to fetch conversations from Chatwoot' }, { status: 502 })
  }

  const meta = {
    all_count: totalAllCount,
    open_count: totalOpenCount,
    resolved_count: totalResolvedCount,
  }
  // Calculate stats for current month
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000
  const thisMonth = allConversations.filter((c: any) => c.created_at >= startOfMonth)

  const stats = {
    total: meta.all_count || allConversations.length,
    open: meta.open_count || 0,
    resolved: meta.resolved_count || 0,
    thisMonth: thisMonth.length,
  }

  return NextResponse.json({
    conversations: allConversations,
    meta: meta || {},
    stats,
  })
}
