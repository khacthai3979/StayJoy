import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPayOSPaymentLink } from '@/lib/payment/payos'

// GET /api/wallet — retrieve wallet points balance, transaction log, and dynamic plan settings
export async function GET() {
  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1. Get user property mapping
    const { data: propertyData, error: propError } = await supabase
      .from('users_properties')
      .select('property_id')
      .eq('user_id', session.user.id)
      .single()

    if (propError || !propertyData) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const propertyId = propertyData.property_id

    // 2. Fetch or dynamically initialize wallet (lazy creation)
    let { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('points_balance')
      .eq('property_id', propertyId)
      .maybeSingle()

    if (!wallet && !walletError) {
      // Lazy insert wallet with 0 balance
      const { data: newWallet, error: insertError } = await supabase
        .from('wallets')
        .insert({ property_id: propertyId, points_balance: 0 })
        .select('points_balance')
        .single()

      if (!insertError) {
        wallet = newWallet
      } else {
        console.error('[GET /api/wallet] Lazy wallet insert failed:', insertError)
      }
    }

    // 3. Fetch transaction log
    const { data: transactions } = await supabase
      .from('wallet_transactions')
      .select('id, amount_vnd, points, type, status, description, created_at')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })

    // 4. Fetch dynamic plan settings (allowing admin updates to reflect instantly)
    const { data: plans } = await supabase
      .from('plan_settings')
      .select('plan, price_points, message_limit')

    return NextResponse.json({
      balance: wallet?.points_balance ?? 0,
      transactions: transactions ?? [],
      plans: plans ?? []
    })

  } catch (error) {
    console.error('[GET /api/wallet]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// POST /api/wallet — initiate PayOS deposit transaction and generate checkout QR code
export async function POST(request: NextRequest) {
  const supabase = createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { amount?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const amount = Number(body.amount)
  if (isNaN(amount) || amount < 1000) {
    return NextResponse.json({ error: 'Số tiền nạp tối thiểu là 1,000 VND' }, { status: 400 })
  }

  try {
    // 1. Get property_id
    const { data: propertyData, error: propError } = await supabase
      .from('users_properties')
      .select('property_id')
      .eq('user_id', session.user.id)
      .single()

    if (propError || !propertyData) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const propertyId = propertyData.property_id

    // 2. Generate a random unique PayOS 64-bit integer order code
    // PayOS requires orderCode to be a integer <= 9007199254740991
    const orderCode = Math.floor(100000000 + Math.random() * 900000000)

    // Calculate point reward (e.g. 1,000 VND = 1 Point)
    const points = Math.floor(amount / 1000)

    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = request.headers.get('x-forwarded-proto') || 'http'
    const baseUrl = `${protocol}://${host}`

    const returnUrl = `${baseUrl}/dashboard/billing?status=success&orderCode=${orderCode}`
    const cancelUrl = `${baseUrl}/dashboard/billing?status=cancelled&orderCode=${orderCode}`

    // 3. Create PayOS Payment link
    const payosResponse = await createPayOSPaymentLink({
      orderCode,
      amount,
      description: `Nap ${points} diem thuong`,
      returnUrl,
      cancelUrl
    })

    // 4. Save pending transaction in database
    const { error: txError } = await supabase
      .from('wallet_transactions')
      .insert({
        property_id: propertyId,
        amount_vnd: amount,
        points,
        type: 'deposit',
        status: 'pending',
        description: `Nạp ${points.toLocaleString()} điểm thưởng qua PayOS`,
        payos_order_code: orderCode
      })

    if (txError) {
      console.error('[POST /api/wallet] Failed to insert transaction:', txError)
      throw txError
    }

    return NextResponse.json({
      checkoutUrl: payosResponse.checkoutUrl,
      orderCode
    })

  } catch (error) {
    console.error('[POST /api/wallet]', error)
    return NextResponse.json({ error: 'Failed to create payment link' }, { status: 500 })
  }
}

// PATCH /api/wallet — handle frontend cancellation of a pending transaction
export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { orderCode, status } = body

    if (!orderCode || status !== 'failed') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { error: txError } = await supabase
      .from('wallet_transactions')
      .update({ status: 'failed' })
      .eq('payos_order_code', orderCode)
      .eq('status', 'pending') // Only cancel if it's pending

    if (txError) throw txError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/wallet]', error)
    return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 })
  }
}
