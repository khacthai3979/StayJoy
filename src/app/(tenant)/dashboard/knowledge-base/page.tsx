'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { SectionCard } from '@/components/knowledge-base/SectionCard'
import { PreviewModal } from '@/components/knowledge-base/PreviewModal'
import { ChatTestWidget } from '@/components/knowledge-base/ChatTestWidget'
import { VALID_SECTION_KEYS } from '@/lib/knowledge-base/types'
import type { SectionKey, KnowledgeBaseSection, SectionUpdate } from '@/lib/knowledge-base/types'
import { BookOpen, Eye, Database, CheckCircle } from 'lucide-react'

export default function KnowledgeBasePage() {
  const [sections, setSections] = useState<KnowledgeBaseSection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [savingKeys, setSavingKeys] = useState<Set<SectionKey>>(new Set())
  const [propertyId, setPropertyId] = useState<string>('')
  const { toast } = useToast()

  const fetchSections = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/knowledge-base/sections')
      if (!res.ok) throw new Error('Không thể tải dữ liệu')
      const data = await res.json()
      const fetchedSections = data.sections ?? []
      setSections(fetchedSections)
      if (fetchedSections.length > 0) {
        setPropertyId(fetchedSections[0].property_id)
      } else {
        // No sections yet — get property_id from /api/properties/me
        const propRes = await fetch('/api/properties/me')
        if (propRes.ok) {
          const propData = await propRes.json()
          if (propData.property_id) setPropertyId(propData.property_id)
        }
      }
    } catch {
      setError('Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSections()
  }, [fetchSections])

  async function handleToggle(key: SectionKey, isActive: boolean) {
    const res = await fetch(`/api/knowledge-base/sections/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: isActive }),
    })
    if (!res.ok) throw new Error('Toggle failed')
    const data = await res.json()
    setSections((prev) =>
      prev.map((s) => (s.section_key === key ? data.section : s))
        .concat(
          prev.find((s) => s.section_key === key) ? [] : [data.section]
        )
    )
  }

  async function handleSave(key: SectionKey, updates: SectionUpdate) {
    setSavingKeys((prev) => new Set(prev).add(key))
    try {
      const res = await fetch(`/api/knowledge-base/sections/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Save failed')
      }
      const data = await res.json()
      setSections((prev) =>
        prev.map((s) => (s.section_key === key ? data.section : s))
          .concat(
            prev.find((s) => s.section_key === key) ? [] : [data.section]
          )
      )
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  function getSectionData(key: SectionKey): KnowledgeBaseSection | null {
    return sections.find((s) => s.section_key === key) ?? null
  }

  // Calculate statistics
  const activeCount = VALID_SECTION_KEYS.filter((key) => {
    const s = sections.find((sec) => sec.section_key === key)
    return s ? s.is_active : true
  }).length
  const totalCount = VALID_SECTION_KEYS.length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-indigo-50/50 via-transparent to-transparent dark:from-indigo-950/10 p-5 rounded-2xl border border-indigo-100/30">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>Cơ Sở Tri Thức (Knowledge Base)</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Quản lý thông tin, chính sách và dịch vụ homestay để cung cấp dữ liệu huấn luyện cho chatbot AI trả lời khách hàng.
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => setPreviewOpen(true)}
          className="rounded-xl border-border/80 text-xs font-semibold h-10 px-4 flex items-center gap-1.5 hover:bg-muted self-start md:self-auto shrink-0"
        >
          <Eye className="w-4 h-4" />
          <span>Xem Preview System Message</span>
        </Button>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center max-w-md mx-auto">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <Button variant="outline" onClick={fetchSections} className="rounded-lg text-xs font-semibold">Thử lại</Button>
        </div>
      ) : loading ? (
        <div className="space-y-6">
          {/* Skeleton Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/40 border border-muted/20" />
            ))}
          </div>
          {/* Skeleton Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/40 border border-muted/20" />
              ))}
            </div>
            <div className="lg:col-span-1">
              <div className="h-[550px] animate-pulse rounded-2xl bg-muted/40 border border-muted/20" />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Stats Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card border border-border/50 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Nguồn dữ liệu</p>
                <h4 className="text-lg font-bold text-foreground">
                  {activeCount} / {totalCount} <span className="text-xs font-normal text-muted-foreground">mục hoạt động</span>
                </h4>
              </div>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Trạng thái chatbot</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-sm font-bold text-foreground">Sẵn sàng phản hồi</span>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border/50 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Độ phủ tri thức</p>
                <h4 className="text-lg font-bold text-foreground">
                  {Math.round((activeCount / totalCount) * 100)}% <span className="text-xs font-normal text-muted-foreground">đã cấu hình</span>
                </h4>
              </div>
            </div>
          </div>

          {/* Main Layout Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sections — 2/3 width */}
            <div className="lg:col-span-2 space-y-4">
              {VALID_SECTION_KEYS.map((key) => (
                <SectionCard
                  key={key}
                  sectionKey={key}
                  data={getSectionData(key)}
                  onToggle={handleToggle}
                  onSave={handleSave}
                  isSaving={savingKeys.has(key)}
                />
              ))}
            </div>

            {/* Chat Test Widget — 1/3 width, sticky */}
            <div className="lg:col-span-1">
              <div className="sticky top-6">
                <ChatTestWidget propertyId={propertyId} />
              </div>
            </div>
          </div>
        </>
      )}

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        propertyId=""
      />
    </div>
  )
}
