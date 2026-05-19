import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

async function getAdminUser(supabase: ReturnType<typeof createClient>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: userProperty } = await supabase
    .from('users_properties')
    .select('role')
    .eq('user_id', session.user.id)
    .limit(1)
    .single()

  if (!userProperty || userProperty.role !== 'admin') return null
  return session.user
}

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const VALID_CHANNELS = ['telegram', 'zalo', 'messenger', 'instagram', 'whatsapp', 'website']

/**
 * GET /api/admin/channels?property_id=xxx
 * Returns channel mappings for a property (or all if no property_id)
 */
export async function GET(request: NextRequest) {
  const supabase = createClient()
  const user = await getAdminUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const propertyId = searchParams.get('property_id')

  const serviceClient = getServiceClient()

  let query = serviceClient
    .from('channel_mappings')
    .select('*, properties(name)')
    .order('created_at', { ascending: false })

  if (propertyId) {
    query = query.eq('property_id', propertyId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[GET /api/admin/channels]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  return NextResponse.json({ channels: data ?? [] })
}

/**
 * POST /api/admin/channels
 * Create a new channel mapping
 */
export async function POST(request: NextRequest) {
  const supabase = createClient()
  const user = await getAdminUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    property_id: string
    channel: string
    inbox_id?: string
    config?: Record<string, unknown>
    is_active?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { property_id, channel, inbox_id, config, is_active } = body

  if (!property_id || !channel) {
    return NextResponse.json({ error: 'property_id and channel are required' }, { status: 400 })
  }

  if (!VALID_CHANNELS.includes(channel)) {
    return NextResponse.json(
      { error: `Invalid channel. Must be one of: ${VALID_CHANNELS.join(', ')}` },
      { status: 400 }
    )
  }

  const serviceClient = getServiceClient()

  const { data, error } = await serviceClient
    .from('channel_mappings')
    .insert({
      property_id,
      channel,
      inbox_id: inbox_id || null,
      config: config || {},
      is_active: is_active !== false,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Channel mapping already exists for this property' }, { status: 409 })
    }
    console.error('[POST /api/admin/channels]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  return NextResponse.json({ channel: data }, { status: 201 })
}

/**
 * PUT /api/admin/channels
 * Update a channel mapping
 */
export async function PUT(request: NextRequest) {
  const supabase = createClient()
  const user = await getAdminUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    id: string
    inbox_id?: string
    config?: Record<string, unknown>
    is_active?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const serviceClient = getServiceClient()

  const updateData: Record<string, unknown> = {}
  if (body.inbox_id !== undefined) updateData.inbox_id = body.inbox_id || null
  if (body.config !== undefined) updateData.config = body.config
  if (body.is_active !== undefined) updateData.is_active = body.is_active

  const { data, error } = await serviceClient
    .from('channel_mappings')
    .update(updateData)
    .eq('id', body.id)
    .select()
    .single()

  if (error) {
    console.error('[PUT /api/admin/channels]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  return NextResponse.json({ channel: data })
}

/**
 * DELETE /api/admin/channels?id=xxx
 * Delete a channel mapping
 */
export async function DELETE(request: NextRequest) {
  const supabase = createClient()
  const user = await getAdminUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const serviceClient = getServiceClient()

  const { error } = await serviceClient
    .from('channel_mappings')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[DELETE /api/admin/channels]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
