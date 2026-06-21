'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bot, Cpu, CreditCard, LogOut, TableOfContents, ClipboardList, Building, MessageCircle, Settings, CalendarCheck2, Sparkles, Users, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

interface NavItem {
  href: string
  label: string
  icon?: LucideIcon
  ownerOnly?: boolean
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Tổng Quan', icon: TableOfContents },
  { href: '/dashboard/bookings', label: 'Yêu Cầu Đặt Phòng', icon: ClipboardList },
  { href: '/dashboard/rooms', label: 'Quản Lý Phòng', icon: Building },
  { href: '/dashboard/conversations', label: 'Hội Thoại', icon: MessageCircle },
  { href: '/dashboard/knowledge-base', label: 'Knowledge Base', icon: Bot, ownerOnly: true },
  { href: '/dashboard/ai-feedbacks', label: 'Cải Thiện Chatbot', icon: Sparkles, ownerOnly: true },
  { href: '/dashboard/usage', label: 'Sử Dụng AI', icon: Cpu, ownerOnly: true },
  { href: '/dashboard/billing', label: 'Ví & Thanh Toán', icon: CreditCard, ownerOnly: true },
  { href: '/dashboard/staff', label: 'Quản Lý Nhân Viên', icon: Users, ownerOnly: true },
  { href: '/dashboard/settings', label: 'Cài Đặt Homestay', icon: Settings, ownerOnly: true },
]

export function SidebarNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRole() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('users_properties')
        .select('role')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (data) setUserRole(data.role)
    }
    fetchRole()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Lọc menu: Staff chỉ thấy các tab không bị đánh dấu ownerOnly
  const visibleItems = navItems.filter((item) => {
    if (item.ownerOnly && userRole === 'staff') return false
    return true
  })

  return (
    <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
      {visibleItems.map(({ href, label, icon: Icon }) => {
        const isActive =
          href === '/dashboard' ? pathname === href : pathname.startsWith(href)

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {label}
          </Link>
        )
      })}
      <div className="mt-auto pt-4 border-t">
        <button
          onClick={handleLogout}
          className="w-full rounded-md px-3 py-2 text-sm font-medium transition-colors flex items-center gap-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </button>
      </div>
    </nav>
  )
}
