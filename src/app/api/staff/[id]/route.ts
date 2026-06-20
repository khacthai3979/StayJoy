import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// =============================================================================
// PATCH /api/staff/[id] — Cập nhật quyền hạn của Staff
// DELETE /api/staff/[id] — Xóa tài khoản Staff
// =============================================================================

// Helper: Xác thực Owner + kiểm tra Staff thuộc cùng property
async function verifyOwnerAndStaff(staffUserId: string) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Kiểm tra người gọi là Owner
  const { data: ownerRecord } = await supabase
    .from('users_properties')
    .select('property_id')
    .eq('user_id', user.id)
    .eq('role', 'owner')
    .limit(1)
    .single()

  if (!ownerRecord) return null

  // Kiểm tra Staff thuộc cùng property
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: staffRecord } = await supabaseAdmin
    .from('users_properties')
    .select('id, user_id, property_id')
    .eq('user_id', staffUserId)
    .eq('property_id', ownerRecord.property_id)
    .eq('role', 'staff')
    .limit(1)
    .single()

  if (!staffRecord) return null

  return { supabaseAdmin, staffRecord, propertyId: ownerRecord.property_id }
}

// ---------------------------------------------------------------------------
// PATCH: Cập nhật permissions
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await verifyOwnerAndStaff(params.id)
  if (!result) {
    return NextResponse.json(
      { error: 'Không có quyền hoặc nhân viên không tồn tại' },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { permissions } = body

  if (!permissions || typeof permissions !== 'object') {
    return NextResponse.json({ error: 'permissions là bắt buộc' }, { status: 400 })
  }

  const { error } = await result.supabaseAdmin
    .from('users_properties')
    .update({ permissions })
    .eq('user_id', params.id)
    .eq('property_id', result.propertyId)
    .eq('role', 'staff')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// ---------------------------------------------------------------------------
// DELETE: Xóa tài khoản Staff
// ---------------------------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await verifyOwnerAndStaff(params.id)
  if (!result) {
    return NextResponse.json(
      { error: 'Không có quyền hoặc nhân viên không tồn tại' },
      { status: 403 }
    )
  }

  // Xóa record trong users_properties
  const { error: deleteRecordError } = await result.supabaseAdmin
    .from('users_properties')
    .delete()
    .eq('user_id', params.id)
    .eq('property_id', result.propertyId)

  if (deleteRecordError) {
    return NextResponse.json({ error: deleteRecordError.message }, { status: 500 })
  }

  // Xóa user trong auth.users
  const { error: deleteUserError } = await result.supabaseAdmin.auth.admin.deleteUser(params.id)

  if (deleteUserError) {
    return NextResponse.json({ error: deleteUserError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
