'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/admin', label: 'Tổng Quan' },
  { href: '/admin/properties', label: 'Properties' },
  { href: '/admin/subscriptions', label: 'Subscriptions' },
  { href: '/admin/channels', label: 'Channels' },
  { href: '/admin/onboard', label: 'Onboard' },
  { href: '/admin/llm-settings', label: 'AI Settings' },
]

export function AdminSidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {navItems.map(({ href, label }) => {
        const isActive =
          href === '/admin' ? pathname === href : pathname.startsWith(href)

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
