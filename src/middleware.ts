import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — required by @supabase/ssr updateSession pattern
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Requirement 1.1: No session → redirect /login
  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Fetch user's role from users_properties
  const { data: userProperty } = await supabase
    .from('users_properties')
    .select('role, property_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  // Requirement 1.5: Logged in but no record in users_properties → redirect /onboarding
  if (!userProperty) {
    const onboardingUrl = request.nextUrl.clone()
    onboardingUrl.pathname = '/onboarding'
    return NextResponse.redirect(onboardingUrl)
  }

  const { role } = userProperty

  // Requirement 1.2: admin → allow /admin/*, block /dashboard/*
  if (role === 'admin') {
    if (pathname.startsWith('/dashboard')) {
      const adminUrl = request.nextUrl.clone()
      adminUrl.pathname = '/admin'
      return NextResponse.redirect(adminUrl)
    }
    return supabaseResponse
  }

  // Requirement 1.3: owner/staff → allow /dashboard/*, block /admin/*
  if (role === 'owner' || role === 'staff') {
    if (pathname.startsWith('/admin')) {
      const dashboardUrl = request.nextUrl.clone()
      dashboardUrl.pathname = '/dashboard'
      return NextResponse.redirect(dashboardUrl)
    }

    // Requirement 1.4: Check subscription status — expired → redirect /subscription-expired
    // Exclude /dashboard/settings and /subscription-expired itself from the check
    if (
      pathname.startsWith('/dashboard') &&
      pathname !== '/dashboard/settings' &&
      !pathname.startsWith('/subscription-expired')
    ) {
      const { data: property } = await supabase
        .from('properties')
        .select('plan, expires_at')
        .eq('id', userProperty.property_id)
        .limit(1)
        .single()

      if (property) {
        const isExpiredByDate =
          property.expires_at !== null &&
          new Date(property.expires_at) < new Date()

        if (isExpiredByDate) {
          const expiredUrl = request.nextUrl.clone()
          expiredUrl.pathname = '/subscription-expired'
          return NextResponse.redirect(expiredUrl)
        }
      }
    }

    return supabaseResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - /login, /auth/* (auth routes)
     * - /onboarding (avoid redirect loop)
     * - /api/chatwoot/* (webhook from Chatwoot, no auth needed)
     * - /api/knowledge-base (n8n API, uses X-API-Key)
     * - /api/n8n/* (n8n endpoints, uses service role)
     * - /_next/* (Next.js internals)
     * - /favicon.ico, static files
     */
    '/((?!login|auth|onboarding|subscription-expired|privacy|terms|api/chatwoot|api/wallet/payos-webhook|api/knowledge-base|api/n8n|api/cron|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
