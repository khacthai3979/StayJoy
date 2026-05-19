'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'

const CHANNEL_OPTIONS = [
  { value: 'telegram', label: 'Telegram', icon: '📱' },
  { value: 'zalo', label: 'Zalo OA', icon: '💬' },
  { value: 'messenger', label: 'Messenger', icon: '💭' },
  { value: 'instagram', label: 'Instagram', icon: '📷' },
  { value: 'whatsapp', label: 'WhatsApp', icon: '📞' },
  { value: 'website', label: 'Website Widget', icon: '🌐' },
]

interface Property {
  id: string
  name: string
}

interface ChannelMapping {
  id: string
  property_id: string
  channel: string
  inbox_id: string | null
  config: Record<string, unknown>
  is_active: boolean
  created_at: string
  properties?: { name: string }
}

export default function ChannelsPage() {
  const { toast } = useToast()

  const [properties, setProperties] = useState<Property[]>([])
  const [channels, setChannels] = useState<ChannelMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('')

  // New channel form
  const [showForm, setShowForm] = useState(false)
  const [formPropertyId, setFormPropertyId] = useState('')
  const [formChannel, setFormChannel] = useState('')
  const [formInboxId, setFormInboxId] = useState('')
  const [formZaloOaId, setFormZaloOaId] = useState('')
  const [formZaloToken, setFormZaloToken] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadProperties()
    loadChannels()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadChannels()
  }, [selectedPropertyId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProperties() {
    try {
      const res = await fetch('/api/admin/llm-settings/properties')
      if (res.ok) {
        const data = await res.json()
        setProperties(data.properties ?? [])
      }
    } catch (err) {
      console.error('Failed to load properties:', err)
    }
  }

  async function loadChannels() {
    setLoading(true)
    try {
      const url = selectedPropertyId
        ? `/api/admin/channels?property_id=${selectedPropertyId}`
        : '/api/admin/channels'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setChannels(data.channels ?? [])
      }
    } catch (err) {
      console.error('Failed to load channels:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!formPropertyId || !formChannel) {
      toast({ title: 'Lỗi', description: 'Vui lòng chọn property và kênh', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const config: Record<string, unknown> = {}
      if (formChannel === 'zalo') {
        config.zalo_oa_id = formZaloOaId
        config.access_token = formZaloToken
      }

      const res = await fetch('/api/admin/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: formPropertyId,
          channel: formChannel,
          inbox_id: formInboxId || null,
          config,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create')
      }

      toast({ title: 'Thành công', description: 'Đã thêm kênh mới' })
      setShowForm(false)
      resetForm()
      loadChannels()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định'
      toast({ title: 'Lỗi', description: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(id: string, currentActive: boolean) {
    try {
      const res = await fetch('/api/admin/channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentActive }),
      })
      if (res.ok) {
        loadChannels()
      }
    } catch (err) {
      console.error('Failed to toggle channel:', err)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Xác nhận xóa kênh này?')) return

    try {
      const res = await fetch(`/api/admin/channels?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast({ title: 'Đã xóa' })
        loadChannels()
      }
    } catch (err) {
      console.error('Failed to delete channel:', err)
    }
  }

  function resetForm() {
    setFormPropertyId('')
    setFormChannel('')
    setFormInboxId('')
    setFormZaloOaId('')
    setFormZaloToken('')
  }

  function getChannelLabel(channel: string) {
    return CHANNEL_OPTIONS.find(c => c.value === channel)?.label ?? channel
  }

  function getChannelIcon(channel: string) {
    return CHANNEL_OPTIONS.find(c => c.value === channel)?.icon ?? '📡'
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản Lý Kênh Chatbot</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Đóng' : '+ Thêm Kênh'}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Quản lý các kênh chat (Telegram, Zalo, Messenger...) kết nối với từng property qua Chatwoot.
      </p>

      {/* Filter by property */}
      <div className="flex items-center gap-3">
        <Label>Lọc theo property:</Label>
        <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Tất cả" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Add Channel Form */}
      {showForm && (
        <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
          <h2 className="font-semibold">Thêm Kênh Mới</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Property</Label>
              <Select value={formPropertyId} onValueChange={setFormPropertyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn property..." />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Kênh</Label>
              <Select value={formChannel} onValueChange={setFormChannel}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn kênh..." />
                </SelectTrigger>
                <SelectContent>
                  {CHANNEL_OPTIONS.map((ch) => (
                    <SelectItem key={ch.value} value={ch.value}>
                      {ch.icon} {ch.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Chatwoot Inbox ID (nếu đã tạo inbox)</Label>
            <Input
              value={formInboxId}
              onChange={(e) => setFormInboxId(e.target.value)}
              placeholder="VD: 12345"
            />
          </div>

          {/* Zalo-specific config */}
          {formChannel === 'zalo' && (
            <div className="space-y-4 rounded border p-3">
              <p className="text-sm font-medium">Cấu hình Zalo OA</p>
              <div className="space-y-2">
                <Label>Zalo OA ID</Label>
                <Input
                  value={formZaloOaId}
                  onChange={(e) => setFormZaloOaId(e.target.value)}
                  placeholder="VD: 4318012345678"
                />
              </div>
              <div className="space-y-2">
                <Label>Access Token</Label>
                <Input
                  type="password"
                  value={formZaloToken}
                  onChange={(e) => setFormZaloToken(e.target.value)}
                  placeholder="Zalo OA access token..."
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Tạo Kênh'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm() }}>
              Hủy
            </Button>
          </div>
        </div>
      )}

      {/* Channel List */}
      {loading ? (
        <p className="text-muted-foreground">Đang tải...</p>
      ) : channels.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          Chưa có kênh nào được cấu hình
        </div>
      ) : (
        <div className="space-y-3">
          {channels.map((ch) => (
            <div key={ch.id} className="rounded-lg border p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getChannelIcon(ch.channel)}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{getChannelLabel(ch.channel)}</span>
                    <Badge variant={ch.is_active ? 'default' : 'secondary'}>
                      {ch.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {ch.properties?.name ?? 'Unknown property'}
                    {ch.inbox_id && ` • Inbox: ${ch.inbox_id}`}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggle(ch.id, ch.is_active)}
                >
                  {ch.is_active ? 'Tắt' : 'Bật'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(ch.id)}
                >
                  Xóa
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
