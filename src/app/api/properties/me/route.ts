import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get property linked to the current user via users_properties
    const { data, error } = await supabase
      .from('users_properties')
      .select('property_id, properties(id, name, address, hotline, description, system_prompt_template, plan, expires_at, notification_email)')
      .eq('user_id', session.user.id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    return NextResponse.json({ property: data.properties })
  } catch (error) {
    console.error('[GET /api/properties/me]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    name?: unknown
    address?: unknown
    hotline?: unknown
    description?: unknown
    system_prompt_template?: unknown
    notification_email?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, address, hotline, description, system_prompt_template, notification_email } = body

  // Build update payload with only provided fields
  const updates: Record<string, string> = {}
  if (name !== undefined) updates.name = String(name)
  if (address !== undefined) updates.address = String(address)
  if (hotline !== undefined) updates.hotline = String(hotline)
  if (description !== undefined) updates.description = String(description)
  if (system_prompt_template !== undefined) updates.system_prompt_template = String(system_prompt_template)
  if (notification_email !== undefined) updates.notification_email = notification_email ? String(notification_email) : ''

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    // Get the property_id for the current user
    const { data: ownership, error: ownerError } = await supabase
      .from('users_properties')
      .select('property_id')
      .eq('user_id', session.user.id)
      .single()

    if (ownerError || !ownership) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('properties')
      .update(updates)
      .eq('id', ownership.property_id)
      .select('id, name, address, hotline, description, system_prompt_template, notification_email')
      .single()

    if (error) throw error

    return NextResponse.json({ property: data })
  } catch (error) {
    console.error('[PUT /api/properties/me]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
