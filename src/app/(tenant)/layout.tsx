import { SidebarNav } from '@/components/dashboard/SidebarNav'
import { createClient } from '@/lib/supabase/server'
import { getExpiryState, ExpiryState } from '@/lib/subscription'
import { ExpiryBanner } from '@/components/dashboard/ExpiryBanner'

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  let expiryState: ExpiryState = { shouldShow: false, daysLeft: null, level: null, isTrial: false }

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { data: userProperty } = await supabase
        .from('users_properties')
        .select('property_id')
        .eq('user_id', user.id)
        .single()

      if (userProperty) {
        const { data: property } = await supabase
          .from('properties')
          .select('plan, expires_at')
          .eq('id', userProperty.property_id)
          .single()

        expiryState = getExpiryState(property)
      }
    }
  } catch {
    // fallback: don't show banner on error
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r bg-card flex flex-col">
        <div className="px-6 py-5 border-b">
          <span className="text-lg font-semibold tracking-tight">StayJoy</span>
        </div>
        <SidebarNav />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <ExpiryBanner state={expiryState} />
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}
