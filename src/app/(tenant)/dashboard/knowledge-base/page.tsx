'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { SectionCard } from '@/components/knowledge-base/SectionCard'
import { PreviewModal } from '@/components/knowledge-base/PreviewModal'
import { ChatTestWidget } from '@/components/knowledge-base/ChatTestWidget'
import { VALID_SECTION_KEYS } from '@/lib/knowledge-base/types'
import type { SectionKey, KnowledgeBaseSection, SectionUpdate } from '@/lib/knowledge-base/types'

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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Cơ Sở Tri Thức (Knowledge Base)</h1>
        <Button variant="outline" onClick={() => setPreviewOpen(true)}>
          Xem Preview
        </Button>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-destructive/30 bg-destructive/10 p-8 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={fetchSections}>Thử lại</Button>
        </div>
      ) : loading ? (
        <div className="space-y-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
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
      )}

      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        propertyId=""
      />
    </div>
  )
}
