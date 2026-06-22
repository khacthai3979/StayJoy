'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Wallet,
  Coins,
  ArrowUpRight,
  TrendingUp,
  Sparkles,
  HelpCircle,
  Activity,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { KPICardSkeleton } from '@/components/dashboard/KPICard'

interface Transaction {
  id: string
  amount_vnd: number
  points: number
  type: 'deposit' | 'upgrade' | 'renew' | 'refund'
  status: 'pending' | 'success' | 'failed'
  description: string
  created_at: string
}

interface PlanSetting {
  plan: 'lite' | 'pro' | 'premium'
  price_points: number
  message_limit: number
}

export default function BillingPage() {
  const [balance, setBalance] = useState<number>(0)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [plans, setPlans] = useState<PlanSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form states
  const [depositAmount, setDepositAmount] = useState<string>('200000')
  const [depositing, setDepositing] = useState(false)
  const [subscribing, setSubscribing] = useState<string | null>(null)

  const { toast } = useToast()
  const searchParams = useSearchParams()

  const fetchBillingData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/wallet')
      if (!res.ok) throw new Error('Không thể tải thông tin ví')
      const json = await res.json()
      setBalance(json.balance ?? 0)
      setTransactions(json.transactions ?? [])
      setPlans(json.plans ?? [])
    } catch {
      setError('Đã xảy ra lỗi khi tải dữ liệu thanh toán. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBillingData()
  }, [fetchBillingData])

  // Toast status updates from PayOS redirect params
  useEffect(() => {
    const status = searchParams.get('status')
    if (status === 'success') {
      toast({
        title: 'Nạp tiền thành công!',
        description: 'Điểm thưởng đã được cộng vào tài khoản của bạn.',
        variant: 'default'
      })
      fetchBillingData()
    } else if (status === 'cancelled') {
      const orderCode = searchParams.get('orderCode')
      if (orderCode) {
        fetch('/api/wallet', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderCode: Number(orderCode), status: 'failed' })
        }).then(() => fetchBillingData())
      }
      toast({
        title: 'Giao dịch bị hủy',
        description: 'Bạn đã hủy quy trình nạp tiền qua PayOS.',
        variant: 'destructive'
      })
    }
  }, [searchParams, toast, fetchBillingData])

  // Quick select amount
  function selectAmount(val: number) {
    setDepositAmount(String(val))
  }

  // Handle PayOS deposit redirect
  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault()
    const amount = Number(depositAmount)
    if (isNaN(amount) || amount < 1000) {
      toast({
        title: 'Lỗi nạp tiền',
        description: 'Số tiền nạp tối thiểu là 1,000 VND',
        variant: 'destructive'
      })
      return
    }

    setDepositing(true)
    try {
      const res = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Nạp tiền thất bại')
      }

      const json = await res.json()
      if (json.checkoutUrl) {
        // Redirect to PayOS checkout page
        window.location.href = json.checkoutUrl
      } else {
        throw new Error('Không nhận được link thanh toán từ PayOS')
      }
    } catch (err: any) {
      toast({
        title: 'Lỗi cổng thanh toán',
        description: err.message || 'Không thể tạo yêu cầu nạp tiền. Vui lòng thử lại.',
        variant: 'destructive'
      })
    } finally {
      setDepositing(false)
    }
  }

  // Handle Point-based subscription purchase / renewal
  async function handleSubscribe(planName: string, pointsCost: number) {
    if (balance < pointsCost) {
      toast({
        title: 'Không đủ số dư',
        description: `Bạn cần ${pointsCost} điểm để đăng ký gói này nhưng hiện tại chỉ có ${balance} điểm. Vui lòng nạp thêm.`,
        variant: 'destructive'
      })
      return
    }

    const confirmSub = confirm(`Bạn có chắc chắn muốn sử dụng ${pointsCost} điểm thưởng để đăng ký/gia hạn gói ${planName.toUpperCase()} trong 1 tháng không?`)
    if (!confirmSub) return

    setSubscribing(planName)
    try {
      const res = await fetch('/api/wallet/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planName, durationMonths: 1 })
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Đăng ký thất bại')
      }

      const json = await res.json()
      toast({
        title: 'Đăng ký thành công!',
        description: `Homestay đã được kích hoạt gói ${json.plan} đến ngày ${new Date(json.expiresAt).toLocaleDateString('vi-VN')}.`,
        variant: 'default'
      })
      fetchBillingData()
    } catch (err: any) {
      toast({
        title: 'Lỗi đăng ký',
        description: err.message || 'Đăng ký gói cước thất bại. Vui lòng thử lại.',
        variant: 'destructive'
      })
    } finally {
      setSubscribing(null)
    }
  }

  function getTransactionBadge(status: string) {
    switch (status.toLowerCase()) {
      case 'success':
        return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium">Thành công</Badge>
      case 'pending':
        return <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-medium animate-pulse">Chờ thanh toán</Badge>
      case 'failed':
        return <Badge className="bg-rose-500 hover:bg-rose-600 text-white font-medium">Đã hủy</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  function getPlanTitle(plan: string) {
    const titles: Record<string, string> = {
      lite: 'Gói LITE AI',
      pro: 'Gói PRO AI',
      premium: 'Gói PREMIUM AI'
    }
    return titles[plan.toLowerCase()] || plan
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ví & Thanh Toán</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Quản lý số dư điểm thưởng, nạp tiền qua PayOS và kích hoạt/gia hạn các gói dịch vụ chatbot.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchBillingData} className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Làm mới ví
        </Button>
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center max-w-xl">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium text-destructive">{error}</p>
          <Button variant="outline" onClick={fetchBillingData}>Thử lại</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Columns - Wallet points info and dynamic plans listing */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Wallet points card */}
            <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 p-6 text-white shadow-lg">
              <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-indigo-500/20 blur-3xl" />
              <div className="absolute right-4 top-4 text-indigo-400">
                <Sparkles className="h-8 w-8 animate-pulse" />
              </div>

              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Ví Điểm Thưởng Homestay</p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-5xl font-extrabold tracking-tight">
                  {loading ? '...' : balance.toLocaleString()}
                </span>
                <span className="text-indigo-300 text-lg font-medium">điểm</span>
              </div>
              <p className="text-xs text-indigo-200/80 mt-1">
                Tương đương: <span className="font-semibold text-white">{(balance * 1000).toLocaleString()} VND</span>
              </p>

              <div className="mt-6 border-t border-indigo-500/30 pt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-indigo-200/80">
                <p>Nạp điểm thưởng tỷ lệ: 1,000 VND = 1 Điểm</p>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Kích hoạt an toàn qua PayOS QR</span>
                </div>
              </div>
            </div>

            {/* Dynamic subscription plans list */}
            <div>
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-foreground">
                <Coins className="h-5 w-5 text-indigo-500" />
                Gia Hạn & Nâng Cấp Gói AI Chatbot
              </h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-48 border rounded-xl animate-pulse bg-muted" />
                  ))
                ) : plans.length > 0 ? (
                  plans.map((p) => {
                    const price = p.price_points
                    const limit = p.message_limit
                    const isFree = price === 0
                    
                    return (
                      <div
                        key={p.plan}
                        className="relative rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md flex flex-col justify-between min-h-[220px]"
                      >
                        <div>
                          <span className="text-xs font-bold text-muted-foreground uppercase">{p.plan}</span>
                          <h3 className="font-bold text-base mt-1 text-foreground">{getPlanTitle(p.plan)}</h3>
                          <div className="mt-3 flex items-baseline gap-0.5">
                            <span className="text-2xl font-extrabold">{isFree ? 'Miễn Phí' : price.toLocaleString()}</span>
                            {!isFree && <span className="text-xs text-muted-foreground"> điểm/tháng</span>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Giới hạn: <strong className="text-foreground">{limit.toLocaleString()} tin nhắn</strong>
                          </p>
                        </div>

                        <div className="mt-5">
                          {isFree ? (
                            <Button variant="outline" size="sm" className="w-full text-xs font-semibold cursor-not-allowed" disabled>
                              Gói cơ bản
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleSubscribe(p.plan, price)}
                              disabled={subscribing !== null}
                              size="sm"
                              className="w-full text-xs font-semibold"
                            >
                              {subscribing === p.plan ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : null}
                              Kích hoạt 1 Tháng
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">Không tìm thấy thông tin cấu hình gói cước từ Admin.</p>
                )}
              </div>
            </div>

            {/* Transactions Log table */}
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="p-5 border-b bg-gradient-to-r from-card to-background flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-base">Nhật Ký Giao Dịch</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Danh sách nạp tiền PayOS và giao dịch gói cước gần nhất.</p>
                </div>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground font-semibold border-b text-xs uppercase tracking-wider">
                      <th className="px-5 py-3.5">Thời gian</th>
                      <th className="px-5 py-3.5">Chi tiết</th>
                      <th className="px-5 py-3.5">Loại</th>
                      <th className="px-5 py-3.5 text-right">Giá trị (VND)</th>
                      <th className="px-5 py-3.5 text-right">Điểm</th>
                      <th className="px-5 py-3.5 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs sm:text-sm">
                    {loading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="px-5 py-3.5"><div className="h-4 w-24 rounded bg-muted" /></td>
                          <td className="px-5 py-3.5"><div className="h-4 w-32 rounded bg-muted" /></td>
                          <td className="px-5 py-3.5"><div className="h-4 w-12 rounded bg-muted" /></td>
                          <td className="px-5 py-3.5"><div className="h-4 w-16 rounded bg-muted ml-auto" /></td>
                          <td className="px-5 py-3.5"><div className="h-4 w-12 rounded bg-muted ml-auto" /></td>
                          <td className="px-5 py-3.5"><div className="h-5 w-16 rounded bg-muted mx-auto" /></td>
                        </tr>
                      ))
                    ) : transactions.length > 0 ? (
                      transactions.map((tx) => {
                        const isMinus = tx.type === 'upgrade' || tx.type === 'renew'
                        return (
                          <tr key={tx.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">
                              {new Date(tx.created_at).toLocaleString('vi-VN')}
                            </td>
                            <td className="px-5 py-3.5 font-medium">{tx.description}</td>
                            <td className="px-5 py-3.5 capitalize font-medium text-muted-foreground">{tx.type}</td>
                            <td className="px-5 py-3.5 text-right font-mono font-medium">
                              {tx.amount_vnd > 0 ? `${tx.amount_vnd.toLocaleString()}đ` : '-'}
                            </td>
                            <td className={`px-5 py-3.5 text-right font-mono font-bold ${isMinus ? 'text-rose-500' : 'text-emerald-500'}`}>
                              {isMinus ? '-' : '+'}{tx.points.toLocaleString()}
                            </td>
                            <td className="px-5 py-3.5 text-center">{getTransactionBadge(tx.status)}</td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                          Chưa có lịch sử giao dịch điểm thưởng nào.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

          {/* Right Column - PayOS deposit card form */}
          <div className="space-y-6">
            <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col gap-5">
              <div>
                <h3 className="font-bold text-base flex items-center gap-1.5 text-foreground">
                  <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                  Nạp Điểm Thưởng
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nạp điểm thưởng thông minh qua quét mã ngân hàng VietQR của PayOS.
                </p>
              </div>

              <form onSubmit={handleDeposit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Số Tiền VND Cần Nạp</label>
                  <div className="relative">
                    <Input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      disabled={depositing}
                      placeholder="Nhập số tiền nạp"
                      className="font-mono text-base font-bold pr-12 pl-3"
                    />
                    <span className="absolute right-3 top-2.5 font-semibold text-xs text-muted-foreground">VND</span>
                  </div>
                </div>

                {/* Reward points preview conversion */}
                <div className="p-3.5 bg-muted/50 rounded-lg flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Điểm thưởng quy đổi:</span>
                  <strong className="text-emerald-600 dark:text-emerald-400 font-mono text-sm flex items-center gap-1">
                    <Coins className="h-4 w-4 inline" />
                    +{Math.floor((Number(depositAmount) || 0) / 1000).toLocaleString()} điểm
                  </strong>
                </div>

                {/* Quick Select Buttons Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => selectAmount(50000)}
                    disabled={depositing}
                    className="p-2 border rounded-md hover:bg-accent transition-colors"
                  >
                    50,000đ (+50đ)
                  </button>
                  <button
                    type="button"
                    onClick={() => selectAmount(100000)}
                    disabled={depositing}
                    className="p-2 border rounded-md hover:bg-accent transition-colors"
                  >
                    100,000đ (+100đ)
                  </button>
                  <button
                    type="button"
                    onClick={() => selectAmount(200000)}
                    disabled={depositing}
                    className="p-2 border rounded-md hover:bg-accent transition-colors"
                  >
                    200,000đ (+200đ)
                  </button>
                  <button
                    type="button"
                    onClick={() => selectAmount(500000)}
                    disabled={depositing}
                    className="p-2 border rounded-md hover:bg-accent transition-colors"
                  >
                    500,000đ (+500đ)
                  </button>
                </div>

                <Button type="submit" disabled={depositing} className="w-full flex items-center justify-center gap-2 mt-2">
                  {depositing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Nạp tiền qua PayOS
                </Button>
              </form>

              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 text-[10px] text-emerald-800 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30">
                <p className="font-semibold mb-1">💡 Hướng dẫn nạp tiền:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Nhập số tiền và click "Nạp tiền qua PayOS".</li>
                  <li>Hệ thống sẽ dẫn bạn đến trang cổng thanh toán VietQR PayOS.</li>
                  <li>Mở ứng dụng Mobile Banking của bất kỳ ngân hàng nào và quét mã QR để chuyển khoản.</li>
                  <li>Sau khi chuyển khoản thành công, tài khoản sẽ tự động cộng điểm trong vòng vài giây!</li>
                </ol>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
