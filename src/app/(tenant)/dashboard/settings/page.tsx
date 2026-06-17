'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'

interface Property {
  id: string
  name: string
  address: string
  hotline: string
  notification_email: string
}

type FormValues = Omit<Property, 'id'>

interface ChannelMapping {
  id: string
  channel: string
  inbox_id: string | null
  is_active: boolean
  created_at: string
}

const CHANNEL_LABELS: Record<string, { label: string; icon: string }> = {
  telegram: { label: 'Telegram', icon: '📱' },
  zalo: { label: 'Zalo OA', icon: '💬' },
  messenger: { label: 'Messenger', icon: '💭' },
  instagram: { label: 'Instagram', icon: '📷' },
  whatsapp: { label: 'WhatsApp', icon: '📞' },
  website: { label: 'Website Widget', icon: '🌐' },
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormValues>({
    name: '',
    address: '',
    hotline: '',
    notification_email: '',
  })

  // Password change states
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [channels, setChannels] = useState<ChannelMapping[]>([])
  const [channelsLoading, setChannelsLoading] = useState(true)
  const { toast } = useToast()

  const fetchProperty = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/properties/me')
      if (!res.ok) throw new Error('Không thể tải thông tin homestay')
      const json = await res.json()
      const p: Property = json.property
      setForm({
        name: p.name ?? '',
        address: p.address ?? '',
        hotline: p.hotline ?? '',
        notification_email: p.notification_email ?? '',
      })
    } catch {
      setError('Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchChannels = useCallback(async () => {
    setChannelsLoading(true)
    try {
      const res = await fetch('/api/channels/me')
      if (res.ok) {
        const json = await res.json()
        setChannels(json.channels ?? [])
      }
    } catch {
      // Silently fail — channels section is informational
    } finally {
      setChannelsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProperty()
    fetchChannels()
  }, [fetchProperty, fetchChannels])

  function handleChange(field: keyof FormValues, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const snapshot = { ...form }
    setSaving(true)
    try {
      const res = await fetch('/api/properties/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Update failed')
      const json = await res.json()
      const p: Property = json.property
      setForm({
        name: p.name ?? '',
        address: p.address ?? '',
        hotline: p.hotline ?? '',
        notification_email: p.notification_email ?? '',
      })
      toast({ title: 'Đã lưu cài đặt thành công.' })
    } catch {
      setForm(snapshot)
      toast({
        title: 'Lưu thất bại',
        description: 'Không thể cập nhật cài đặt. Vui lòng thử lại.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast({ title: 'Lỗi', description: 'Vui lòng nhập đầy đủ các trường mật khẩu.', variant: 'destructive' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Lỗi', description: 'Mật khẩu mới và xác nhận mật khẩu không trùng khớp.', variant: 'destructive' })
      return
    }
    if (newPassword.length < 6) {
      toast({ title: 'Lỗi', description: 'Mật khẩu mới phải có ít nhất 6 ký tự.', variant: 'destructive' })
      return
    }

    setPasswordSaving(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword, confirmPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Đổi mật khẩu thất bại')
      }
      toast({ title: 'Thành công', description: 'Mật khẩu của bạn đã được thay đổi.' })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordForm(false)
    } catch (err: any) {
      toast({ title: 'Lỗi', description: err.message || 'Lỗi hệ thống', variant: 'destructive' })
    } finally {
      setPasswordSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center gap-4 rounded-lg border border-destructive/30 bg-destructive/10 p-8 text-center max-w-2xl">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={fetchProperty}>Thử lại</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Cài Đặt Homestay</h1>

      {/* Property Info Form */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Thông Tin Cơ Bản</h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Tên homestay</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              disabled={saving}
              placeholder="Nhập tên homestay"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Địa chỉ</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => handleChange('address', e.target.value)}
              disabled={saving}
              placeholder="Nhập địa chỉ"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hotline">Hotline</Label>
            <Input
              id="hotline"
              value={form.hotline}
              onChange={(e) => handleChange('hotline', e.target.value)}
              disabled={saving}
              placeholder="Nhập số hotline"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notification_email">Email nhận thông báo</Label>
            <Input
              id="notification_email"
              type="email"
              value={form.notification_email}
              onChange={(e) => handleChange('notification_email', e.target.value)}
              disabled={saving}
              placeholder="Nhập email nhận thông báo (đặt phòng, yêu cầu hỗ trợ...)"
            />
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
          </Button>
        </form>
      </section>

      {/* Change Password Section */}
      <section className="border-t pt-6">
        <h2 className="text-lg font-semibold mb-4">Mật khẩu & Bảo mật</h2>
        {!showPasswordForm ? (
          <Button onClick={() => setShowPasswordForm(true)} variant="outline">
            🔒 Thay đổi mật khẩu
          </Button>
        ) : (
          <form onSubmit={handlePasswordSubmit} className="space-y-4 rounded-lg border p-4 bg-muted/20 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="oldPassword">Mật khẩu cũ</Label>
              <Input
                id="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                disabled={passwordSaving}
                placeholder="Nhập mật khẩu hiện tại"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Mật khẩu mới</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={passwordSaving}
                placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={passwordSaving}
                placeholder="Nhập lại mật khẩu mới"
                required
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={passwordSaving}>
                {passwordSaving ? 'Đang lưu...' : 'Lưu mật khẩu mới'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowPasswordForm(false)
                  setOldPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                }}
                disabled={passwordSaving}
              >
                Hủy
              </Button>
            </div>
          </form>
        )}
      </section>

      {/* Connected Channels */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Kênh Chatbot Đã Kết Nối</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Các kênh chat được admin cấu hình cho homestay của bạn. Liên hệ admin để thêm hoặc thay đổi kênh.
        </p>

        {channelsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            <p>Chưa có kênh chatbot nào được kết nối.</p>
            <p className="text-xs mt-1">Liên hệ admin để thiết lập kênh chat (Zalo, Telegram, Messenger...)</p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((ch) => {
              const info = CHANNEL_LABELS[ch.channel] ?? { label: ch.channel, icon: '📡' }
              return (
                <div
                  key={ch.id}
                  className="flex items-center gap-3 rounded-lg border p-4"
                >
                  <span className="text-2xl" aria-hidden="true">{info.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{info.label}</span>
                      <Badge variant={ch.is_active ? 'default' : 'secondary'}>
                        {ch.is_active ? 'Hoạt động' : 'Tạm tắt'}
                      </Badge>
                    </div>
                    {ch.inbox_id && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Inbox ID: {ch.inbox_id}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
