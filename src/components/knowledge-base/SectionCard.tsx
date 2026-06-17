'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/use-toast'
import { 
  Info, 
  BedDouble, 
  ShieldCheck, 
  Coffee, 
  Sparkles, 
  HelpCircle, 
  GitMerge, 
  FileText, 
  Edit3, 
  Save, 
  X,
  AlertTriangle
} from 'lucide-react'
import type { SectionKey, KnowledgeBaseSection, SectionUpdate } from '@/lib/knowledge-base/types'

const MAX_CONTENT_LENGTH = 5000

interface SectionConfig {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  badgeColor: string
  activeBorder: string
  activeBg: string
  iconBg: string
  iconColor: string
}

const SECTION_CONFIGS: Record<SectionKey, SectionConfig> = {
  general_info: {
    title: 'Thông Tin Chung',
    description: 'Tên homestay, địa chỉ, số điện thoại, thông tin liên hệ và giới thiệu tổng quan.',
    icon: Info,
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-150 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900',
    activeBorder: 'border-blue-150 focus-within:border-blue-400 dark:border-blue-900/40',
    activeBg: 'bg-blue-50/10 dark:bg-blue-950/5',
    iconBg: 'bg-blue-100/50 dark:bg-blue-950/40',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  rooms_pricing: {
    title: 'Phòng & Giá',
    description: 'Các thông tin bổ sung về loại phòng, chính sách giá phụ thu hoặc chi tiết phòng nâng cao.',
    icon: BedDouble,
    badgeColor: 'bg-violet-50 text-violet-700 border-violet-150 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-900',
    activeBorder: 'border-violet-150 focus-within:border-violet-400 dark:border-violet-900/40',
    activeBg: 'bg-violet-50/10 dark:bg-violet-950/5',
    iconBg: 'bg-violet-100/50 dark:bg-violet-950/40',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  policies: {
    title: 'Chính Sách',
    description: 'Quy định nhận/trả phòng, chính sách hủy phòng, hoàn tiền, quy định thú cưng hoặc độ ồn.',
    icon: ShieldCheck,
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-150 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900',
    activeBorder: 'border-emerald-150 focus-within:border-emerald-400 dark:border-emerald-900/40',
    activeBg: 'bg-emerald-50/10 dark:bg-emerald-950/5',
    iconBg: 'bg-emerald-100/50 dark:bg-emerald-950/40',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  amenities: {
    title: 'Tiện Ích & Dịch Vụ',
    description: 'Các tiện ích phòng (wifi, điều hòa) và dịch vụ tiện nghi chung của homestay.',
    icon: Coffee,
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-150 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900',
    activeBorder: 'border-amber-150 focus-within:border-amber-400 dark:border-amber-900/40',
    activeBg: 'bg-amber-50/10 dark:bg-amber-950/5',
    iconBg: 'bg-amber-100/50 dark:bg-amber-950/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  upsell: {
    title: 'Dịch Vụ Upsell',
    description: 'Dịch vụ gia tăng: thuê xe máy, giặt là, tổ chức tiệc BBQ, đặt đồ ăn sáng.',
    icon: Sparkles,
    badgeColor: 'bg-rose-50 text-rose-700 border-rose-150 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900',
    activeBorder: 'border-rose-150 focus-within:border-rose-400 dark:border-rose-900/40',
    activeBg: 'bg-rose-50/10 dark:bg-rose-950/5',
    iconBg: 'bg-rose-100/50 dark:bg-rose-950/40',
    iconColor: 'text-rose-600 dark:text-rose-400',
  },
  faq: {
    title: 'Câu Hỏi Thường Gặp',
    description: 'Giải đáp nhanh vị trí, đường đi, khu vực gửi xe, ăn uống, vui chơi xung quanh.',
    icon: HelpCircle,
    badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-150 dark:bg-cyan-950/30 dark:text-cyan-400 dark:border-cyan-900',
    activeBorder: 'border-cyan-150 focus-within:border-cyan-400 dark:border-cyan-900/40',
    activeBg: 'bg-cyan-50/10 dark:bg-cyan-950/5',
    iconBg: 'bg-cyan-100/50 dark:bg-cyan-950/40',
    iconColor: 'text-cyan-600 dark:text-cyan-400',
  },
  sister_properties: {
    title: 'Homestay Liên Kết',
    description: 'Thông tin hệ thống homestay khác hoặc đối tác để giới thiệu khi hết phòng.',
    icon: GitMerge,
    badgeColor: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-350 dark:border-slate-700',
    activeBorder: 'border-slate-200 focus-within:border-slate-400 dark:border-slate-800',
    activeBg: 'bg-slate-50/10 dark:bg-slate-900/5',
    iconBg: 'bg-slate-100 dark:bg-slate-800/60',
    iconColor: 'text-slate-600 dark:text-slate-450',
  },
}

interface SectionCardProps {
  sectionKey: SectionKey
  data: KnowledgeBaseSection | null
  onToggle: (key: SectionKey, isActive: boolean) => Promise<void>
  onSave: (key: SectionKey, updates: SectionUpdate) => Promise<void>
  isSaving: boolean
}

export function SectionCard({ sectionKey, data, onToggle, onSave, isSaving }: SectionCardProps) {
  const config = SECTION_CONFIGS[sectionKey]
  const Icon = config.icon

  const [isActive, setIsActive] = useState(data?.is_active ?? true)
  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(data?.title ?? config.title)
  const [content, setContent] = useState(data?.content ?? '')
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  // Sync with data when it is loaded/updated
  useEffect(() => {
    if (data) {
      setIsActive(data.is_active)
      if (!isEditing) {
        setTitle(data.title ?? config.title)
        setContent(data.content ?? '')
      }
    }
  }, [data, isEditing, config.title])

  async function handleToggle(checked: boolean) {
    const previousState = isActive
    setIsActive(checked)

    try {
      await onToggle(sectionKey, checked)
      toast({
        title: checked ? 'Đã bật mục' : 'Đã tắt mục',
        description: `Mục "${title}" đã được ${checked ? 'bật' : 'tắt'} thành công.`,
      })
    } catch {
      setIsActive(previousState)
      toast({
        title: 'Lỗi',
        description: 'Không thể cập nhật trạng thái. Vui lòng thử lại.',
        variant: 'destructive',
      })
    }
  }

  function handleCancel() {
    setTitle(data?.title ?? config.title)
    setContent(data?.content ?? '')
    setError(null)
    setIsEditing(false)
  }

  async function handleSave() {
    if (!content.trim()) {
      setError('Nội dung không được để trống')
      return
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      setError(`Nội dung không được vượt quá 5.000 ký tự (hiện tại: ${content.length} ký tự)`)
      return
    }

    setError(null)

    try {
      await onSave(sectionKey, { title, content })
      toast({
        title: 'Thành công',
        description: `Đã cập nhật nội dung mục "${title}".`,
      })
      setIsEditing(false)
    } catch {
      toast({
        title: 'Lỗi',
        description: 'Không thể lưu nội dung. Vui lòng thử lại.',
        variant: 'destructive',
      })
    }
  }

  const charPercent = Math.min(100, (content.length / MAX_CONTENT_LENGTH) * 100)

  return (
    <div 
      className={`rounded-2xl border bg-card p-5 space-y-4 transition-all duration-300 ${
        isActive 
          ? `${config.activeBorder} ${config.activeBg} shadow-sm hover:shadow-md` 
          : 'border-dashed border-border/60 opacity-65 bg-muted/5'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${config.iconBg} ${config.iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground tracking-wide">
                {title}
              </h3>
              {sectionKey === 'rooms_pricing' && (
                <Badge variant="outline" className={`${config.badgeColor} text-[10px] px-1.5 py-0.5 font-medium`}>
                  Hệ thống tự động
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/90 max-w-sm md:max-w-md">
              {config.description}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 bg-muted/40 dark:bg-muted/10 rounded-full px-3 py-1.5 border border-border/30">
          <span className={`text-[10px] font-semibold tracking-wider uppercase ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
            {isActive ? 'Bật' : 'Tắt'}
          </span>
          <Switch
            checked={isActive}
            onCheckedChange={handleToggle}
            className="data-[state=checked]:bg-emerald-500"
          />
        </div>
      </div>

      {/* rooms_pricing note */}
      {sectionKey === 'rooms_pricing' && (
        <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/10 border border-amber-100/40 rounded-xl p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-500 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Thông tin tự động:</strong> Dữ liệu phòng và giá phòng từ hệ thống homestay của bạn luôn được đồng bộ vào chatbot. Mục này chỉ dùng để bạn bổ sung các ghi chú đặc biệt khác (ví dụ: cách đặt cọc, quy định tính phí phạt...).
          </p>
        </div>
      )}

      {/* Edit form or view view */}
      {isEditing ? (
        <div className="space-y-4 pt-2 border-t border-border/30 animate-in fade-in-50 duration-200">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">Tiêu đề hiển thị</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tiêu đề hiển thị"
              disabled={isSaving}
              className="rounded-xl border-border/60 focus-visible:ring-indigo-500 focus-visible:ring-1 text-sm h-9"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-foreground/80 tracking-wide uppercase">Nội dung dữ liệu</label>
            <Textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                if (error) setError(null)
              }}
              placeholder={`Nhập thông tin chi tiết về ${title.toLowerCase()} để huấn luyện AI...`}
              rows={5}
              disabled={isSaving}
              className="resize-y rounded-xl border-border/60 focus-visible:ring-indigo-500 focus-visible:ring-1 text-sm p-3 leading-relaxed"
            />
            
            {/* Progress bar and counter */}
            <div className="space-y-1.5 pt-1">
              <div className="w-full h-1 bg-muted dark:bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-300 ${
                    content.length > MAX_CONTENT_LENGTH 
                      ? 'bg-destructive' 
                      : content.length > MAX_CONTENT_LENGTH * 0.9 
                      ? 'bg-amber-500' 
                      : 'bg-indigo-600 dark:bg-indigo-500'
                  }`}
                  style={{ width: `${charPercent}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[11px]">
                {error ? (
                  <p className="text-destructive font-medium">{error}</p>
                ) : (
                  <span className="text-muted-foreground/80">Nhập thông tin rõ ràng, mạch lạc để AI hiểu tốt nhất.</span>
                )}
                <span className={`font-mono font-medium ${content.length > MAX_CONTENT_LENGTH ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {content.length.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button 
              size="sm" 
              onClick={handleSave} 
              disabled={isSaving}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs h-8 px-3 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu lại'}</span>
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleCancel} 
              disabled={isSaving}
              className="rounded-lg border-border/80 text-xs font-semibold h-8 px-3 flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>Hủy bỏ</span>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 pt-2 border-t border-border/20">
          {content ? (
            <div className="bg-muted/20 dark:bg-zinc-950/10 border border-border/30 rounded-xl p-3.5 relative group hover:bg-muted/30 transition-colors">
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap line-clamp-3">
                {content}
              </p>
              {content.length > 200 && (
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-muted/20 dark:from-zinc-950/10 to-transparent pointer-events-none rounded-b-xl" />
              )}
            </div>
          ) : (
            <div className="bg-muted/10 border border-dashed border-border/50 rounded-xl p-6 text-center">
              <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/80 italic">Chưa có nội dung. Bấm nút dưới để thêm thông tin.</p>
            </div>
          )}
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => setIsEditing(true)}
            className="rounded-lg border-border/80 text-xs font-semibold h-8 px-3 flex items-center gap-1.5 hover:bg-muted"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Chỉnh sửa</span>
          </Button>
        </div>
      )}
    </div>
  )
}
