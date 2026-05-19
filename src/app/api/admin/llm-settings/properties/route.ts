import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * GET /api/admin/llm-settings/properties
 * Returns list of all properties (id, name) for the admin LLM settings dropdown.
 */
export async function GET() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: userProperty } = await supabase
    .from('users_properties')
    .select('role')
    .eq('user_id', session.user.id)
    .limit(1)
    .single()

  if (!userProperty || userProperty.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await serviceClient
    .from('properties')
    .select('id, name')
    .order('name')

  if (error) {
    console.error('[GET /api/admin/llm-settings/properties]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }

  return NextResponse.json({ properties: data ?? [] })
}
