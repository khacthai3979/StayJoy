'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { Plus, Trash2, Shield, ShieldCheck } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StaffPermissions {
  can_view_bookings: boolean
  can_view_conversations: boolean
  can_view_calendar: boolean
  can_edit_rooms: boolean
  can_edit_knowledge: boolean
  can_view_revenue: boolean
  can_view_usage: boolean
  can_edit_settings: boolean
  can_manage_billing: boolean
}

interface StaffMember {
  id: string
  email: string
  permissions: StaffPermissions
  created_at: string
}

const PERMISSION_LABELS: Record<keyof StaffPermissions, string> = {
  can_view_bookings: 'Xem đặt phòng',
  can_view_conversations: 'Xem hội thoại',
  can_view_calendar: 'Xem lịch phòng',
  can_edit_rooms: 'Sửa thông tin phòng',
  can_edit_knowledge: 'Sửa Knowledge Base',
  can_view_revenue: 'Xem doanh thu',
  can_view_usage: 'Xem sử dụng AI',
  can_edit_settings: 'Sửa cài đặt',
  can_manage_billing: 'Quản lý thanh toán',
}

const DEFAULT_PERMISSIONS: StaffPermissions = {
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
// Component
// ---------------------------------------------------------------------------

export default function StaffPage() {
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPermissions, setNewPermissions] = useState<StaffPermissions>(DEFAULT_PERMISSIONS)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const { toast } = useToast()

  // -------------------------------------------------------------------------
  // Fetch staff list
  // -------------------------------------------------------------------------
  const fetchStaff = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/staff')
      if (!res.ok) throw new Error('Không thể tải danh sách nhân viên')
      const data = await res.json()
      setStaffList(data.staff || [])
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể tải danh sách nhân viên', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchStaff() }, [fetchStaff])

  // -------------------------------------------------------------------------
  // Create staff
  // -------------------------------------------------------------------------
  async function handleCreate() {
    if (!newEmail || !newPassword) {
      toast({ title: 'Thiếu thông tin', description: 'Vui lòng nhập email và mật khẩu', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, permissions: newPermissions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Tạo nhân viên thất bại')
      toast({ title: 'Thành công', description: `Đã tạo tài khoản cho ${newEmail}` })
      setNewEmail('')
      setNewPassword('')
      setNewPermissions(DEFAULT_PERMISSIONS)
      setShowCreateForm(false)
      fetchStaff()
    } catch (err: any) {
      toast({ title: 'Lỗi', description: err.message, variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  // -------------------------------------------------------------------------
  // Update permissions
  // -------------------------------------------------------------------------
  async function handleUpdatePermissions(staffId: string, permissions: StaffPermissions) {
    setSavingId(staffId)
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      })
      if (!res.ok) throw new Error('Cập nhật thất bại')
      toast({ title: 'Đã lưu', description: 'Quyền hạn đã được cập nhật' })
      // Cập nhật local state
      setStaffList((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, permissions } : s))
      )
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể cập nhật quyền hạn', variant: 'destructive' })
    } finally {
      setSavingId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Delete staff
  // -------------------------------------------------------------------------
  async function handleDelete(staffId: string, email: string) {
    if (!confirm(`Bạn có chắc muốn xóa tài khoản ${email}? Hành động này không thể hoàn tác.`)) return
    setDeletingId(staffId)
    try {
      const res = await fetch(`/api/staff/${staffId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Xóa thất bại')
      toast({ title: 'Đã xóa', description: `Tài khoản ${email} đã bị xóa` })
      setStaffList((prev) => prev.filter((s) => s.id !== staffId))
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể xóa nhân viên', variant: 'destructive' })
    } finally {
      setDeletingId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Toggle permission for a staff member (local state + API)
  // -------------------------------------------------------------------------
  function togglePermission(staffId: string, key: keyof StaffPermissions) {
    const staff = staffList.find((s) => s.id === staffId)
    if (!staff) return
    const updated = { ...staff.permissions, [key]: !staff.permissions[key] }
    handleUpdatePermissions(staffId, updated)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quản Lý Nhân Viên</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Tạo tài khoản và phân quyền cho nhân viên của bạn
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Thêm nhân viên
        </Button>
      </div>

      {/* Form tạo nhân viên mới */}
      {showCreateForm && (
        <div className="border rounded-lg p-6 space-y-4 bg-muted/30">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Tạo tài khoản nhân viên mới
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                placeholder="nhanvien@email.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-password">Mật khẩu</Label>
              <Input
                id="staff-password"
                type="password"
                placeholder="Tối thiểu 6 ký tự"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Quyền hạn ban đầu</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {(Object.keys(PERMISSION_LABELS) as (keyof StaffPermissions)[]).map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPermissions[key]}
                    onChange={() => setNewPermissions((prev) => ({ ...prev, [key]: !prev[key] }))}
                    className="rounded"
                  />
                  {PERMISSION_LABELS[key]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Đang tạo...' : 'Tạo nhân viên'}
            </Button>
            <Button variant="outline" onClick={() => setShowCreateForm(false)}>
              Hủy
            </Button>
          </div>
        </div>
      )}

      {/* Danh sách nhân viên */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Đang tải...</div>
      ) : staffList.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Chưa có nhân viên nào</p>
          <p className="text-muted-foreground text-sm mt-1">Bấm "Thêm nhân viên" để bắt đầu</p>
        </div>
      ) : (
        <div className="space-y-4">
          {staffList.map((staff) => (
            <div key={staff.id} className="border rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{staff.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Tạo lúc: {new Date(staff.created_at).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(staff.id, staff.email)}
                  disabled={deletingId === staff.id}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {deletingId === staff.id ? 'Đang xóa...' : 'Xóa'}
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {(Object.keys(PERMISSION_LABELS) as (keyof StaffPermissions)[]).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={staff.permissions?.[key] ?? false}
                      onChange={() => togglePermission(staff.id, key)}
                      disabled={savingId === staff.id}
                      className="rounded"
                    />
                    {PERMISSION_LABELS[key]}
                  </label>
                ))}
              </div>
              {savingId === staff.id && (
                <p className="text-xs text-muted-foreground">Đang lưu...</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
