'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff } from 'lucide-react'


export default function LoginPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm text-center p-8 bg-card border rounded-lg shadow-sm">Đang tải...</div>}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const code = searchParams.get('code')

  useEffect(() => {
    if (code) {
      router.push(`/auth/callback?code=${code}&next=/reset-password`)
    }
  }, [code, router])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showForgot, setShowForgot] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError('Vui lòng nhập email')
      return
    }

    setError(null)
    setResetLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    if (error) {
      setError(error.message)
    } else {
      setResetSent(true)
    }
    setResetLoading(false)
  }

  // --- Forgot Password Form ---
  if (showForgot) {
    return (
      <div className="w-full max-w-sm space-y-6 p-8 rounded-lg border bg-card shadow-sm">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Quên mật khẩu</h1>
          <p className="text-sm text-muted-foreground">
            Nhập email để nhận link đặt lại mật khẩu
          </p>
        </div>

        {resetSent ? (
          <div className="space-y-4 text-center">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <p className="text-sm text-green-800">
                ✓ Đã gửi email đặt lại mật khẩu đến <strong>{email}</strong>
              </p>
              <p className="text-xs text-green-600 mt-1">
                Kiểm tra hộp thư (và thư mục spam) rồi click link trong email.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setShowForgot(false); setResetSent(false) }}
            >
              ← Quay lại đăng nhập
            </Button>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={resetLoading}>
              {resetLoading ? 'Đang gửi...' : 'Gửi link đặt lại mật khẩu'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => { setShowForgot(false); setError(null) }}
            >
              ← Quay lại đăng nhập
            </Button>
          </form>
        )}
      </div>
    )
  }

  // --- Login Form ---
  return (
    <div className="w-full max-w-sm space-y-6 p-8 rounded-lg border bg-card shadow-sm">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Đăng nhập</h1>
        <p className="text-sm text-muted-foreground">Nhập email và mật khẩu để tiếp tục</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Mật khẩu</Label>
            <button
              type="button"
              onClick={() => { setShowForgot(true); setError(null) }}
              className="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
            >
              Quên mật khẩu?
            </button>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pr-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </form>
    </div>
  )
}
