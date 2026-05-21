/**
 * Oxapay: Crypto Invoice Oluştur
 * Paket veya kredi yüklemesi için
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OxapayClient } from '@/lib/oxapay'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { purpose, packageId, amount } = body

    if (!['package', 'credit_topup'].includes(purpose)) {
      return NextResponse.json({ error: 'Geçersiz purpose' }, { status: 400 })
    }

    const adminDb = createAdminClient()
    let totalAmount = 0
    let description = ''
    let packageData: { name?: string; total_price?: number } | null = null

    if (purpose === 'package') {
      const { data: pkg } = await adminDb
        .from('minute_packages')
        .select('*')
        .eq('id', packageId)
        .eq('is_active', true)
        .single()

      if (!pkg) return NextResponse.json({ error: 'Paket bulunamadı' }, { status: 404 })

      totalAmount = pkg.total_price
      description = `${pkg.name} - ${pkg.minutes.toLocaleString('tr-TR')} dakika`
      packageData = pkg
    } else {
      const parsedAmount = parseFloat(amount)
      if (!parsedAmount || parsedAmount < 50 || parsedAmount > 50000) {
        return NextResponse.json({ error: 'Tutar 50₺ - 50000₺ arasında olmalı' }, { status: 400 })
      }
      totalAmount = parsedAmount
      description = `Kredi yüklemesi: ${totalAmount.toFixed(2)}₺`
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
    const oxapay = new OxapayClient()

    // İçsel order_id (payment_intents kaydı için)
    const { data: paymentIntent } = await adminDb
      .from('payment_intents')
      .insert({
        user_id: user.id,
        provider: 'oxapay',
        provider_intent_id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        purpose,
        package_id: purpose === 'package' ? packageId : null,
        amount: totalAmount,
        currency: 'TRY',
        status: 'pending',
        metadata: { description, packageName: packageData?.name },
      })
      .select('id')
      .single()

    if (!paymentIntent) {
      return NextResponse.json({ error: 'Payment intent oluşturulamadı' }, { status: 500 })
    }

    const result = await oxapay.createInvoice({
      amount: totalAmount,
      currency: 'TRY',
      orderId: paymentIntent.id,
      description,
      callbackUrl: 'https://caventrallc.com/api/voiceturko/oxapay/webhook',
      returnUrl: purpose === 'package'
        ? `${appUrl}/dashboard/packages?success=true`
        : `${appUrl}/dashboard/credits?success=true`,
      email: user.email,
    })

    if (!result.success) {
      // Pending intent'i sil
      await adminDb.from('payment_intents').delete().eq('id', paymentIntent.id)
      return NextResponse.json({ error: result.error || 'Oxapay invoice hatası' }, { status: 500 })
    }

    // trackId ile güncelle
    if (result.trackId) {
      await adminDb
        .from('payment_intents')
        .update({ provider_intent_id: result.trackId })
        .eq('id', paymentIntent.id)
    }

    return NextResponse.json({
      success: true,
      payUrl: result.payUrl,
      trackId: result.trackId,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('[Oxapay] Create invoice hatası:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
