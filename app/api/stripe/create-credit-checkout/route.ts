/**
 * Stripe Checkout: Kredi Yükleme (TL)
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
})

const MIN_AMOUNT = 50  // 50₺
const MAX_AMOUNT = 50000 // 50000₺

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { amount } = await request.json()
    const parsedAmount = parseFloat(amount)

    if (!parsedAmount || parsedAmount < MIN_AMOUNT || parsedAmount > MAX_AMOUNT) {
      return NextResponse.json({
        error: `Tutar ${MIN_AMOUNT}₺ - ${MAX_AMOUNT}₺ arasında olmalıdır`,
      }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'try',
            product_data: {
              name: 'Kredi Yüklemesi',
              description: `${parsedAmount.toFixed(2)}₺ kredi yüklemesi`,
            },
            unit_amount: Math.round(parsedAmount * 100),
          },
          quantity: 1,
        },
      ],
      customer_email: user.email,
      success_url: `${appUrl}/dashboard/credits?success=true`,
      cancel_url: `${appUrl}/dashboard/credits?cancelled=true`,
      metadata: {
        purpose: 'credit_topup',
        user_id: user.id,
        amount: parsedAmount.toString(),
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('[Stripe] Credit checkout hatası:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
