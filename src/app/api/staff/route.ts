import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// =============================================================================
// GET /api/staff — Liệt kê tất cả Staff thuộc Homestay của Owner
// POST /api/staff — Tạo tài khoản Staff mới
// =============================================================================

// Quyền mặc định cho Staff mới tạo
const DEFAULT_STAFF_PERMISSIONS = {
  can_view_bookings: true,
  can_view_conversations: true,
  can_view_calendar: true,
  can_edit_rooms: false,
  can_edit_knowledge: false,
  can_view_revenue: false,
  can_view_usage: false,
  can_edit_settings: false,
  can_manage_billing: false,
}

// ---------------------------------------------------------------------------
// Helper: Xác thực người gọi là Owner, trả về property_id
// ---------------------------------------------------------------------------
async function verifyOwner(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: userProperty } = await supabase
    .from('users_properties')
    .select('property_id, role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .limit(1)
    .single()

  if (!userProperty) return null

  return { userId: user.id, propertyId: userProperty.property_id }
}

// ---------------------------------------------------------------------------
// GET: Liệt kê Staff
// ---------------------------------------------------------------------------
export async function GET() {
  const supabase = createClient()

  const ownerInfo = await verifyOwner(supabase)
  if (!ownerInfo) {
    return NextResponse.json({ error: 'Chỉ Owner mới có quyền xem danh sách nhân viên' }, { status: 403 })
  }

  // Lấy tất cả staff thuộc cùng property bằng Admin client (Bypass RLS của users_properties)
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: staffList, error } = await supabaseAdmin
    .from('users_properties')
    .select('id, user_id, role, permissions, created_at')
    .eq('property_id', ownerInfo.propertyId)
    .eq('role', 'staff')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Lấy email cho từng staff
  const staffWithEmail = await Promise.all(
    (staffList || []).map(async (staff) => {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(staff.user_id)
      return {
        id: staff.user_id,
        email: user?.email || 'N/A',
        permissions: staff.permissions || DEFAULT_STAFF_PERMISSIONS,
        created_at: staff.created_at,
      }
    })
  )

  return NextResponse.json({ staff: staffWithEmail })
}

// ---------------------------------------------------------------------------
// POST: Tạo Staff mới
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const supabase = createClient()

  // Guard 1: Xác thực Owner
  const ownerInfo = await verifyOwner(supabase)
  if (!ownerInfo) {
    return NextResponse.json({ error: 'Chỉ Owner mới có quyền tạo nhân viên' }, { status: 403 })
  }

  const body = await request.json()
  const { email, password, permissions } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email và mật khẩu là bắt buộc' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' }, { status: 400 })
  }

  // Dùng Admin client để tạo tài khoản (bypass RLS)
  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Tạo user trong auth.users
  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Tự động xác nhận email
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  // Guard 2: Ép cứng role = 'staff' — KHÔNG cho phép tạo owner/admin qua API này
  const staffPermissions = {
    ...DEFAULT_STAFF_PERMISSIONS,
    ...(permissions || {}),
  }

  // Insert vào users_properties với cùng property_id của Owner
  const { error: insertError } = await supabaseAdmin
    .from('users_properties')
    .insert({
      user_id: newUser.user.id,
      property_id: ownerInfo.propertyId,
      role: 'staff', // Ép cứng — không bao giờ cho phép tạo owner/admin
      permissions: staffPermissions,
    })

  if (insertError) {
    // Rollback: xóa user vừa tạo nếu insert thất bại
    await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    staff: {
      id: newUser.user.id,
      email: newUser.user.email,
      permissions: staffPermissions,
    },
  })
}
