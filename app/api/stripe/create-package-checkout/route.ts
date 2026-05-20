/**
 * Stripe Checkout: Paket Satın Alma
 * Akış: VoiceTurko → Caventra LLC Payment Page → Stripe Checkout
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const CAVENTRA_PAYMENT_URL = 'https://caventrallc.com/payment'
const CAVENTRA_BRAND = 'Caventra LLC'
const CAVENTRA_STMT = 'CAVENTRAL LLC'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2026-01-28.clover' as any,
  })
}

export async function POST(request: Request) {
  const stripe = getStripe()
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { packageId } = await request.json()
    if (!packageId) {
      return NextResponse.json({ error: 'packageId zorunludur' }, { status: 400 })
    }

    const adminDb = createAdminClient()
    const { data: pkg } = await adminDb
      .from('minute_packages')
      .select('*')
      .eq('id', packageId)
      .eq('is_active', true)
      .single()

    if (!pkg) {
      return NextResponse.json({ error: 'Paket bulunamadı' }, { status: 404 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: pkg.currency.toLowerCase(),
            product_data: {
              name: `${CAVENTRA_BRAND} - Account Credit`,
              description: `Digital service credit top-up`,
            },
            unit_amount: Math.round(pkg.total_price * 100),
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        statement_descriptor: CAVENTRA_STMT,
      },
      customer_email: user.email,
      success_url: `${appUrl}/dashboard/packages?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dashboard/packages?cancelled=true`,
      metadata: {
        purpose: 'package',
        user_id: user.id,
        package_id: packageId,
        source: 'voiceturko',
      },
    })

    const amountTL = pkg.total_price
    const paymentPageUrl = `${CAVENTRA_PAYMENT_URL}?s=${encodeURIComponent(session.url!)}&amount=${amountTL}`

    return NextResponse.json({ url: paymentPageUrl })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('[Stripe] Checkout hatası:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
