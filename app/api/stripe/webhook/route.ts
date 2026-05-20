/**
 * Stripe Webhook Handler (Enterprise)
 *
 * Yeni event tipleri:
 * - checkout.session.completed → metadata.purpose'a göre:
 *   - 'package' → Paket aktive et + payment_intents güncelle
 *   - 'credit_topup' → Krediye TL ekle
 *   - 'subscription' (eski) → Plan abonelik aktive et (geriye uyumluluk)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { Billing } from '@/lib/billing'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2026-01-28.clover' as any,
  })
}

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''

export async function POST(request: Request) {
  const stripe = getStripe()
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')!

    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid signature'
      console.error('[Stripe Webhook] Signature verification failed:', msg)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const supabase = createAdminClient()

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const metadata = session.metadata || {}
        const userId = metadata.user_id

        if (!userId) {
          console.warn('[Stripe Webhook] user_id metadata yok')
          break
        }

        // Payment intent kaydet/güncelle (idempotency)
        const paymentIntentId = (session.payment_intent as string) || session.id
        const amount = (session.amount_total || 0) / 100

        // ENTERPRISE: purpose'a göre işle
        const purpose = metadata.purpose || metadata.type

        if (purpose === 'package') {
          const packageId = metadata.package_id
          if (!packageId) {
            console.warn('[Stripe Webhook] package_id yok')
            break
          }

          // ATOMIK CLAIM: pending'den processing'e gec (yarissa sadece biri claim eder)
          // Once upsert ile pending kaydi olustur
          const { data: upserted } = await supabase
            .from('payment_intents')
            .upsert({
              user_id: userId,
              provider: 'stripe',
              provider_intent_id: paymentIntentId,
              purpose: 'package',
              package_id: packageId,
              amount,
              currency: (session.currency || 'try').toUpperCase(),
              status: 'pending',
            }, { onConflict: 'provider,provider_intent_id', ignoreDuplicates: false })
            .select('id, status')
            .single()

          if (upserted?.status === 'completed') {
            console.log('[Stripe] Already completed:', paymentIntentId)
            break
          }

          // Atomik gecis: pending -> processing
          const { data: claimed } = await supabase
            .from('payment_intents')
            .update({ status: 'processing' })
            .eq('id', upserted!.id)
            .eq('status', 'pending')
            .select('id')

          if (!claimed || claimed.length === 0) {
            console.log('[Stripe] Concurrent processing, skip')
            break
          }

          // Billing ONCE (basariliysa completed yap, degilse failed)
          try {
            const result = await Billing.activatePackage(userId, packageId, upserted!.id)
            await supabase.from('payment_intents').update({
              status: result.success ? 'completed' : 'failed',
              completed_at: result.success ? new Date().toISOString() : null,
            }).eq('id', upserted!.id)

            await supabase.from('audit_logs').insert({
              user_id: userId,
              action: 'package.activated',
              resource_type: 'package_purchases',
              metadata: { package_id: packageId, minutes: result.minutes, amount },
              status: result.success ? 'success' : 'failed',
            })
          } catch (e) {
            await supabase.from('payment_intents').update({ status: 'failed' }).eq('id', upserted!.id)
            throw e
          }
        }
        else if (purpose === 'credit_topup') {
          // ATOMIK CLAIM
          const { data: upserted } = await supabase
            .from('payment_intents')
            .upsert({
              user_id: userId,
              provider: 'stripe',
              provider_intent_id: paymentIntentId,
              purpose: 'credit_topup',
              amount,
              currency: (session.currency || 'try').toUpperCase(),
              status: 'pending',
            }, { onConflict: 'provider,provider_intent_id', ignoreDuplicates: false })
            .select('id, status')
            .single()

          if (upserted?.status === 'completed') {
            console.log('[Stripe] Credit topup already completed:', paymentIntentId)
            break
          }

          const { data: claimed } = await supabase
            .from('payment_intents')
            .update({ status: 'processing' })
            .eq('id', upserted!.id)
            .eq('status', 'pending')
            .select('id')

          if (!claimed || claimed.length === 0) {
            console.log('[Stripe] Credit topup concurrent processing, skip')
            break
          }

          try {
            const result = await Billing.topupCredit(userId, amount, upserted!.id, 'topup')
            await supabase.from('payment_intents').update({
              status: result.success ? 'completed' : 'failed',
              completed_at: result.success ? new Date().toISOString() : null,
            }).eq('id', upserted!.id)

            await supabase.from('audit_logs').insert({
              user_id: userId,
              action: 'credit.topup',
              resource_type: 'credit_transactions',
              metadata: { amount, new_balance: result.newBalance },
              status: result.success ? 'success' : 'failed',
            })
          } catch (e) {
            await supabase.from('payment_intents').update({ status: 'failed' }).eq('id', upserted!.id)
            throw e
          }
        }
        else {
          // Legacy purpose'lar artık desteklenmiyor - sessiz logla, hata atma (idempotency için)
          console.warn('[stripe webhook] Bilinmeyen veya legacy purpose:', metadata.purpose || metadata.type)
        }
        break
      }

      case 'checkout.session.expired':
      case 'payment_intent.payment_failed': {
        const obj = event.data.object as { id?: string; payment_intent?: string }
        const intentId = obj.payment_intent || obj.id
        if (intentId) {
          await supabase
            .from('payment_intents')
            .update({ status: 'failed' })
            .eq('provider_intent_id', intentId)
            .eq('provider', 'stripe')
        }
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('[Stripe Webhook] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
