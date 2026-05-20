/**
 * Billing Manager
 *
 * - Kullanıcı bakiyesi (paket dakikası + kredi TL) takibi
 * - Arama sonrası akıllı düşme (önce paket, sonra kredi)
 * - Yetersiz bakiye kontrolü (arama başlatılmadan önce)
 * - Paket aktivasyonu, kredi yüklemesi
 */

import { createAdminClient } from '@/lib/supabase/admin'

const FALLBACK_RATE_PER_MINUTE = 7.0 // ₺/dk (paket bitince)

export interface UserBalance {
  package_minutes_remaining: number
  package_total_minutes: number
  package_rate_per_minute: number
  package_id?: string
  package_purchased_at?: string
  credit_try: number
  total_minutes_used: number
  total_spent_try: number
}

export interface DeductResult {
  success: boolean
  minutes_from_package: number
  minutes_from_credit: number
  package_cost: number
  credit_cost: number
  total_cost: number
  new_package_remaining: number
  new_credit_balance: number
  error?: string
}

export class Billing {
  /**
   * Kullanıcının bakiyesini getir
   */
  static async getBalance(userId: string): Promise<UserBalance> {
    const supabase = createAdminClient()

    const { data } = await supabase
      .from('user_balances')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (!data) {
      // İlk defa - default değerlerle oluştur
      const { data: newBalance } = await supabase
        .from('user_balances')
        .insert({ user_id: userId, credit_try: 0 })
        .select()
        .single()
      return newBalance as UserBalance
    }

    return data as UserBalance
  }

  /**
   * Yeterli bakiye var mı kontrol et (arama başlatmadan önce)
   * En az 1 dakika için yeterli mi?
   */
  static async hasEnoughBalance(userId: string, requiredMinutes: number = 1): Promise<boolean> {
    const balance = await this.getBalance(userId)

    // Paket dakika var mı?
    if (balance.package_minutes_remaining >= requiredMinutes) return true

    // Krediye düşersek yeterli mi?
    const minutesNeededFromCredit = requiredMinutes - balance.package_minutes_remaining
    const requiredCreditAmount = minutesNeededFromCredit * FALLBACK_RATE_PER_MINUTE

    return balance.credit_try >= requiredCreditAmount
  }

  /**
   * Arama sonrası bakiyeden düş (atomic, RPC ile)
   * Önce paket dakikadan, sonra krediden
   */
  static async deductForCall(
    userId: string,
    durationSeconds: number,
    callId?: string
  ): Promise<DeductResult> {
    const supabase = createAdminClient()
    const minutes = Math.max(1, Math.ceil(durationSeconds / 60)) // min 1 dk

    const { data, error } = await supabase.rpc('deduct_balance', {
      p_user_id: userId,
      p_minutes: minutes,
      p_call_id: callId || null,
    })

    if (error) {
      console.error('[Billing] deduct_balance hatası:', error)
      return {
        success: false,
        minutes_from_package: 0,
        minutes_from_credit: 0,
        package_cost: 0,
        credit_cost: 0,
        total_cost: 0,
        new_package_remaining: 0,
        new_credit_balance: 0,
        error: error.message,
      }
    }

    return data as DeductResult
  }

  /**
   * Krediye TL yükle (Stripe/Oxapay sonrası)
   */
  static async topupCredit(
    userId: string,
    amount: number,
    paymentReferenceId?: string,
    transactionType: 'topup' | 'admin_grant' = 'topup'
  ): Promise<{ success: boolean; newBalance: number; error?: string }> {
    const supabase = createAdminClient()

    // RPC ile dene
    const { data, error } = await supabase.rpc('topup_credit', {
      p_user_id: userId,
      p_amount: amount,
      p_transaction_type: transactionType,
      p_reference_id: paymentReferenceId || null,
      p_description: `Kredi y\u00FCklemesi: ${amount.toFixed(2)}\u20BA`,
    })

    if (!error && data) {
      return {
        success: true,
        newBalance: (data as { new_balance: number }).new_balance,
      }
    }

    // RPC yoksa veya hata verdiyse: doğrudan DB update (fallback)
    console.warn('[Billing.topupCredit] RPC hatası, fallback kullanılıyor:', error?.message)

    // user_balances var mı?
    const { data: balance } = await supabase
      .from('user_balances')
      .select('credit_try')
      .eq('user_id', userId)
      .maybeSingle()

    if (!balance) {
      // Kayıt yok — oluştur
      const { error: insertErr } = await supabase
        .from('user_balances')
        .insert({ user_id: userId, credit_try: amount })
      if (insertErr) return { success: false, newBalance: 0, error: insertErr.message }
      
      // Transaction log (opsiyonel - tablo yoksa sessiz geç)
      await supabase.from('credit_transactions').insert({
        user_id: userId,
        amount,
        balance_after: amount,
        transaction_type: transactionType,
        description: `Kredi y\u00FCklemesi: ${amount.toFixed(2)}\u20BA`,
        reference_id: paymentReferenceId || null,
      }).then(() => {}, () => {})

      return { success: true, newBalance: amount }
    }

    // Kayıt var — güncelle
    const newBal = parseFloat(String(balance.credit_try || 0)) + amount
    const { error: updateErr } = await supabase
      .from('user_balances')
      .update({ credit_try: newBal })
      .eq('user_id', userId)

    if (updateErr) return { success: false, newBalance: 0, error: updateErr.message }

    // Transaction log
    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount,
      balance_after: newBal,
      transaction_type: transactionType,
      description: `Kredi y\u00FCklemesi: ${amount.toFixed(2)}\u20BA`,
      reference_id: paymentReferenceId || null,
    }).then(() => {}, () => {})

    return { success: true, newBalance: newBal }
  }

  /**
   * Paket aktive et (ödeme tamamlandıktan sonra)
   */
  static async activatePackage(
    userId: string,
    packageId: string,
    paymentReferenceId?: string
  ): Promise<{
    success: boolean
    minutes?: number
    pricePerMinute?: number
    totalPrice?: number
    error?: string
  }> {
    const supabase = createAdminClient()

    // RPC ile dene
    const { data, error } = await supabase.rpc('activate_package', {
      p_user_id: userId,
      p_package_id: packageId,
      p_payment_id: paymentReferenceId || null,
    })

    if (!error && data) {
      const result = data as { success: boolean; package_minutes?: number; price_per_minute?: number; total_price?: number; error?: string }
      return {
        success: result.success,
        minutes: result.package_minutes,
        pricePerMinute: result.price_per_minute,
        totalPrice: result.total_price,
        error: result.error,
      }
    }

    // RPC yoksa fallback: doğrudan DB update
    console.warn('[Billing.activatePackage] RPC hatası, fallback kullanılıyor:', error?.message)

    // Paketi bul
    const { data: pkg } = await supabase
      .from('minute_packages')
      .select('id, name, minutes, price_per_minute, total_price')
      .eq('id', packageId)
      .single()

    if (!pkg) return { success: false, error: 'Paket bulunamadı' }

    // user_balances güncelle veya oluştur
    const { data: existing } = await supabase
      .from('user_balances')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()

    const balanceData = {
      package_id: packageId,
      package_minutes_remaining: pkg.minutes,
      package_total_minutes: pkg.minutes,
      package_rate_per_minute: pkg.price_per_minute,
      package_purchased_at: new Date().toISOString(),
    }

    if (existing) {
      await supabase.from('user_balances').update(balanceData).eq('user_id', userId)
    } else {
      await supabase.from('user_balances').insert({ user_id: userId, credit_try: 0, ...balanceData })
    }

    // package_purchases log (opsiyonel)
    await supabase.from('package_purchases').insert({
      user_id: userId,
      package_id: packageId,
      amount_paid: 0,
      payment_provider: 'admin',
      payment_reference_id: paymentReferenceId || null,
    }).then(() => {}, () => {})

    return {
      success: true,
      minutes: pkg.minutes,
      pricePerMinute: pkg.price_per_minute,
      totalPrice: pkg.total_price,
    }
  }

  /**
   * Mevcut paketleri listele (kullanıcıya gösterilir)
   */
  static async listPackages() {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('minute_packages')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    return data || []
  }

  /**
   * Kullanıcının arama yapabilme kapasitesi
   */
  static async getCallCapacity(userId: string): Promise<{
    canCall: boolean
    reason?: string
    estimatedMinutesPossible: number
  }> {
    const balance = await this.getBalance(userId)

    // Paket dakika varsa: o kadar dakika
    let estimatedMinutes = balance.package_minutes_remaining

    // Kredi varsa: 7₺/dk'den hesapla
    if (balance.credit_try > 0) {
      estimatedMinutes += Math.floor(balance.credit_try / FALLBACK_RATE_PER_MINUTE)
    }

    if (estimatedMinutes <= 0) {
      return {
        canCall: false,
        reason: 'INSUFFICIENT_BALANCE: Paket veya kredi bakiyeniz yetersiz',
        estimatedMinutesPossible: 0,
      }
    }

    return {
      canCall: true,
      estimatedMinutesPossible: estimatedMinutes,
    }
  }

  /**
   * Son N kredi transaction'ı
   */
  static async getRecentTransactions(userId: string, limit: number = 20) {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    return data || []
  }
}
