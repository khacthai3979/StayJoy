import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()

  // 1. Verify current session
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    oldPassword?: unknown
    newPassword?: unknown
    confirmPassword?: unknown
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { oldPassword, newPassword, confirmPassword } = body

  // 2. Validate input fields
  if (!oldPassword || !newPassword || !confirmPassword) {
    return NextResponse.json({ error: 'Vui lòng nhập đầy đủ tất cả các trường.' }, { status: 400 })
  }

  if (String(newPassword) !== String(confirmPassword)) {
    return NextResponse.json({ error: 'Mật khẩu mới và xác nhận mật khẩu không trùng khớp.' }, { status: 400 })
  }

  if (String(newPassword).length < 6) {
    return NextResponse.json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' }, { status: 400 })
  }

  try {
    const email = session.user.email
    if (!email) {
      return NextResponse.json({ error: 'Không tìm thấy email của tài khoản.' }, { status: 400 })
    }

    // 3. Verify old password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: String(oldPassword),
    })

    if (signInError) {
      return NextResponse.json({ error: 'Mật khẩu cũ không chính xác.' }, { status: 400 })
    }

    // 4. Update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: String(newPassword),
    })

    if (updateError) {
      console.error('[Change Password] Update user error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[POST /api/auth/change-password] Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
