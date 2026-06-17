'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bot, Cpu, CreditCard, LogOut, TableOfContents, ClipboardList, Building, MessageCircle, Settings, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const navItems: { href: string; label: string; icon?: LucideIcon }[] = [
  { href: '/dashboard', label: 'Tổng Quan', icon: TableOfContents },
  // { href: '/dashboard/calendar', label: 'Lịch Phòng', icon: CalendarCheck2 }, // Tạm ẩn — sẽ mở lại khi có tính năng mở rộng
  { href: '/dashboard/bookings', label: 'Yêu Cầu Đặt Phòng', icon: ClipboardList },
  { href: '/dashboard/rooms', label: 'Quản Lý Phòng', icon: Building },
  { href: '/dashboard/conversations', label: 'Hội Thoại', icon: MessageCircle },
  { href: '/dashboard/knowledge-base', label: 'Knowledge Base', icon: Bot },
  { href: '/dashboard/usage', label: 'Sử Dụng AI', icon: Cpu },
  { href: '/dashboard/billing', label: 'Ví & Thanh Toán', icon: CreditCard },
  { href: '/dashboard/settings', label: 'Cài Đặt Homestay', icon: Settings },
]

export function SidebarNav() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
      {navItems.map(({ href, label, icon: Icon }) => {
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
