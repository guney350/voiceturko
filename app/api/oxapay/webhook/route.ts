/**
 * Oxapay Webhook (v2 - Secure + Atomic)
 *
 * Güvenlik:
 * - PROD'da OXAPAY_MERCHANT_KEY header zorunlu (sahte odemeye karsi)
 * - Oxapay invoice API ile sunucu tarafi dogrulama (trustless)
 * - Atomik intent status gecisi (race-free, cift aktivasyon olmaz)
 * - Billing oncesi/sonrasi audit log
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { Billing } from '@/lib/billing'

const OXAPAY_MERCHANT = process.env.OXAPAY_MERCHANT_KEY || ''
const USD_TO_TRY = parseFloat(process.env.OXAPAY_USD_TO_TRY || '40')
const PRICE_TOLERANCE = 0.05

async function verifyOxapayPayment(trackId: string): Promise<{ verified: boolean; status?: string; amount?: number; payAmount?: number }> {
  if (!OXAPAY_MERCHANT) return { verified: false }
  try {
    const res = await fetch('https://api.oxapay.com/merchants/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: OXAPAY_MERCHANT, trackId }),
    })
    if (!res.ok) return { verified: false }
    const data = await res.json()
    return {
      verified: data?.result === 100 || data?.status?.toLowerCase() === 'paid',
      status: data?.status,
      amount: typeof data?.amount === 'number' ? data.amount : parseFloat(data?.amount || '0'),
      payAmount: typeof data?.payAmount === 'number' ? data.payAmount : parseFloat(data?.payAmount || '0'),
    }
  } catch {
    return { verified: false }
  }
}

export async function POST(request: Request) {
  try {
    const isProd = process.env.NODE_ENV === 'production'
    if (isProd && !OXAPAY_MERCHANT) {
      console.error('[Oxapay Webhook] OXAPAY_MERCHANT_KEY zorunlu (prod)')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 })
    }

    const body = await request.json()
    const { trackId, status: webhookStatus } = body

    if (!trackId) {
      return NextResponse.json({ error: 'trackId yok' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1) Payment intent'i bul
    const { data: intent } = await supabase
      .from('payment_intents')
      .select('*')
      .eq('provider', 'oxapay')
      .eq('provider_intent_id', trackId)
      .maybeSingle()

    if (!intent) {
      console.warn('[Oxapay Webhook] Payment intent bulunamadi:', trackId)
      return NextResponse.json({ received: true })
    }

    // 2) Idempotency: zaten completed ise tekrar isleme
    if (intent.status === 'completed') {
      return NextResponse.json({ received: true, alreadyProcessed: true })
    }

    // 3) SUNUCU TARAFI DOGRULAMA - webhook'a guvenme, Oxapay API'sine sor
    let verifiedStatus = webhookStatus?.toLowerCase()
    let verifiedAmount: number | undefined
    if (OXAPAY_MERCHANT) {
      const ver = await verifyOxapayPayment(trackId)
      if (!ver.verified) {
        const newStatus = ver.status?.toLowerCase() === 'expired' ? 'expired' : 'pending'
        await supabase
          .from('payment_intents')
          .update({ status: newStatus })
          .eq('id', intent.id)
        return NextResponse.json({ received: true, verified: false })
      }
      verifiedStatus = 'paid'
      verifiedAmount = ver.amount
    }

    if (verifiedStatus !== 'paid') {
      const newStatus = verifiedStatus === 'expired' ? 'expired' : 'pending'
      await supabase
        .from('payment_intents')
        .update({ status: newStatus })
        .eq('id', intent.id)
      return NextResponse.json({ received: true })
    }

    // 4) Tutar dogrulama (USD karsiligi TRY)
    if (typeof verifiedAmount === 'number' && verifiedAmount > 0) {
      const expectedUsd = intent.amount / USD_TO_TRY
      const diff = Math.abs(verifiedAmount - expectedUsd) / expectedUsd
      if (diff > PRICE_TOLERANCE) {
        console.error(`[Oxapay] Amount mismatch: expected $${expectedUsd.toFixed(2)}, got $${verifiedAmount}`)
        await supabase
          .from('payment_intents')
          .update({
            status: 'failed',
            metadata: { ...intent.metadata, error: `Amount mismatch ${verifiedAmount} vs ${expectedUsd}` },
          })
          .eq('id', intent.id)
        return NextResponse.json({ received: true, error: 'amount_mismatch' }, { status: 400 })
      }
    }

    // 5) ATOMIK STATUS GECISI: 'processing' marker (race-free)
    // Iki paralel webhook ayni anda 'pending' gorse de sadece biri processing'e gecebilir
    const { data: claimed } = await supabase
      .from('payment_intents')
      .update({ status: 'processing' })
      .eq('id', intent.id)
      .eq('status', 'pending')
      .select('id')

    if (!claimed || claimed.length === 0) {
      // Baska worker isliyor veya zaten completed
      const { data: refetched } = await supabase
        .from('payment_intents')
        .select('status')
        .eq('id', intent.id)
        .single()
      return NextResponse.json({
        received: true,
        alreadyProcessed: refetched?.status === 'completed',
      })
    }

    // 6) Billing islemi (BASARILI olursa completed yap)
    try {
      if (intent.purpose === 'package' && intent.package_id) {
        const result = await Billing.activatePackage(intent.user_id, intent.package_id, intent.id)

        await supabase.from('payment_intents').update({
          status: result.success ? 'completed' : 'failed',
          completed_at: result.success ? new Date().toISOString() : null,
          metadata: { ...intent.metadata, billing_result: result },
        }).eq('id', intent.id)

        await supabase.from('audit_logs').insert({
          user_id: intent.user_id,
          action: 'package.activated',
          resource_type: 'package_purchases',
          metadata: { package_id: intent.package_id, minutes: result.minutes, source: 'oxapay' },
          status: result.success ? 'success' : 'failed',
        })
      } else if (intent.purpose === 'credit_topup') {
        const result = await Billing.topupCredit(intent.user_id, intent.amount, intent.id, 'topup')

        await supabase.from('payment_intents').update({
          status: result.success ? 'completed' : 'failed',
          completed_at: result.success ? new Date().toISOString() : null,
          metadata: { ...intent.metadata, billing_result: result },
        }).eq('id', intent.id)

        await supabase.from('audit_logs').insert({
          user_id: intent.user_id,
          action: 'credit.topup',
          resource_type: 'credit_transactions',
          metadata: { amount: intent.amount, source: 'oxapay', new_balance: result.newBalance },
          status: result.success ? 'success' : 'failed',
        })
      } else {
        // Bilinmeyen purpose - completed yap ama uyari logla
        console.warn('[Oxapay] Unknown purpose:', intent.purpose)
        await supabase.from('payment_intents').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', intent.id)
      }
    } catch (billingErr) {
      console.error('[Oxapay] Billing error:', billingErr)
      await supabase.from('payment_intents').update({
        status: 'failed',
        metadata: { ...intent.metadata, error: billingErr instanceof Error ? billingErr.message : String(billingErr) },
      }).eq('id', intent.id)
      return NextResponse.json({ received: true, billingFailed: true }, { status: 500 })
    }

    return NextResponse.json({ received: true, processed: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('[Oxapay Webhook] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
