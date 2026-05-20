/**
 * Minute Tracker
 * Kullanıcının dakika hakkını yönetir.
 * Arama bittiğinde dakika düşer, başlamadan önce yeterlilik kontrol eder.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export class MinuteTracker {
  
  /**
   * Kullanıcının kalan dakikasını hesaplar:
   * Plan dahil dakika + satın alınan ek dakikalar - kullanılan dakikalar
   */
  static async getRemainingMinutes(userId: string): Promise<{
    totalMinutes: number
    usedMinutes: number
    remainingMinutes: number
    planMinutes: number
    extraMinutes: number
  }> {
    const supabase = createAdminClient()
    
    // 1. Kullanıcının aktif aboneliğini ve planını al
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select(`
        id,
        plans (included_minutes)
      `)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()
    
    const planMinutes = (subscription?.plans as unknown as { included_minutes: number } | null)?.included_minutes || 0
    
    // 2. Ek satın alınan dakikaları hesapla
    const { data: purchases } = await supabase
      .from('minute_purchases')
      .select('minutes_purchased')
      .eq('user_id', userId)
    
    const extraMinutes = (purchases || []).reduce(
      (sum, p) => sum + (p.minutes_purchased || 0), 0
    )
    
    // 3. Kullanılan dakikaları hesapla (calls tablosundan)
    const { data: calls } = await supabase
      .from('calls')
      .select('duration_seconds, duration_minutes')
      .eq('user_id', userId)
    
    let usedMinutes = 0
    for (const call of (calls || [])) {
      if (call.duration_seconds) {
        usedMinutes += Math.ceil(call.duration_seconds / 60)
      } else if (call.duration_minutes) {
        usedMinutes += Math.ceil(Number(call.duration_minutes))
      }
    }
    
    const totalMinutes = planMinutes + extraMinutes
    const remainingMinutes = Math.max(0, totalMinutes - usedMinutes)
    
    return {
      totalMinutes,
      usedMinutes,
      remainingMinutes,
      planMinutes,
      extraMinutes,
    }
  }
  
  /**
   * Arama başlatmadan önce dakika yeterliliğini kontrol eder
   */
  static async hasEnoughMinutes(userId: string, requiredMinutes: number = 1): Promise<boolean> {
    const { remainingMinutes } = await this.getRemainingMinutes(userId)
    return remainingMinutes >= requiredMinutes
  }
  
  /**
   * Arama bittiğinde dakika düşer.
   * calls tablosuna arama kaydeder ve duration'ı saklar.
   */
    static async recordCallAndDeductMinutes(
    userId: string,
    callData: {
      vapiCallId: string
      durationSeconds: number
      transcript?: string
      summary?: string
      analysis?: string
      endedReason?: string
      recordingUrl?: string
      vapiAccountId?: string
      campaignItemId?: string
      customerName?: string
      customerNumber?: string
    }
  ): Promise<{
    callId: string
    minutesDeducted: number
    remainingMinutes: number
  }> {
    const supabase = createAdminClient()

    // Dakika hesapla (yukarı yuvarla - 30 saniye bile 1 dakika)
    const minutesDeducted = Math.ceil(callData.durationSeconds / 60)

    // 1. Kullanıcının aktif aboneliğini bul
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()

    // 2. calls tablosuna kaydet (varsa güncelle, yoksa oluştur)
    // customer_name/number sadece varsa set edilir (mevcut değer override edilmez)
    const updatePayload: Record<string, unknown> = {
      transcript: callData.transcript || null,
      summary: callData.summary || null,
      analysis: callData.analysis || callData.summary || null,
      duration_minutes: minutesDeducted,
      duration_seconds: callData.durationSeconds,
      ended_reason: callData.endedReason || null,
      recording_url: callData.recordingUrl || null,
      audio: callData.recordingUrl || '',
      status: 'ended',
    }

    const { data: existingCall } = await supabase
      .from('calls')
      .select('id, customer_name, customer_number')
      .eq('vapi_call_id', callData.vapiCallId)
      .maybeSingle()

    let callRecord: { id: string } | null = null
    let error: any = null

    if (existingCall) {
      // Mevcut kayıt varsa: customer_name/number boşsa doldur, doluysa dokunma
      if (!existingCall.customer_name && callData.customerName) {
        updatePayload.customer_name = callData.customerName
      }
      if (!existingCall.customer_number && callData.customerNumber) {
        updatePayload.customer_number = callData.customerNumber
      }

      const res = await supabase
        .from('calls')
        .update(updatePayload)
        .eq('id', existingCall.id)
        .select('id')
        .single()
      callRecord = res.data
      error = res.error
    } else {
      const res = await supabase
        .from('calls')
        .insert({
          user_id: userId,
          subscription_id: subscription?.id || null,
          vapi_call_id: callData.vapiCallId,
          vapi_account_id: callData.vapiAccountId || null,
          campaign_item_id: callData.campaignItemId || null,
          customer_name: callData.customerName || null,
          customer_number: callData.customerNumber || null,
          call_type: 'outboundPhoneCall',
          duration_minutes: 0,
          duration_seconds: 0,
          audio: '',
          ...updatePayload,
        })
        .select('id')
        .single()
      callRecord = res.data
      error = res.error
      if (error) {
        console.error('[MinuteTracker] INSERT error:', error.code, error.message, error.details)
      }
    }
    
    if (error) {
      console.error('[MinuteTracker] Arama kaydedilemedi:', error)
      throw new Error(`Arama kaydedilemedi: ${error.message}`)
    }
    
    // 3. usages tablosuna da kaydet (uyumluluk)
    if (subscription?.id) {
      await supabase.from('usages').insert({
        user_id: userId,
        subscription_id: subscription.id,
        call_id: callRecord.id,
        cost: minutesDeducted,
      })
    }
    
    // 4. vapi_accounts.total_spent güncelle (harcama takibi)
    if (callData.vapiAccountId) {
      try {
        const { data: costSum } = await supabase
          .from('calls')
          .select('cost')
          .eq('vapi_account_id', callData.vapiAccountId)
          .not('cost', 'is', null)

        const newTotalSpent = (costSum || []).reduce((s, c) => s + (parseFloat(c.cost) || 0), 0)

        await supabase
          .from('vapi_accounts')
          .update({ total_spent: newTotalSpent })
          .eq('id', callData.vapiAccountId)
      } catch (spendErr) {
        console.error('[MinuteTracker] total_spent güncellenemedi:', spendErr)
      }
    }
    
    // 5. Kalan dakikayı hesapla
    const { remainingMinutes } = await this.getRemainingMinutes(userId)
    
    console.log(`[MinuteTracker] User ${userId}: ${minutesDeducted} dk düşüldü, kalan: ${remainingMinutes} dk`)
    
    return {
      callId: callRecord.id,
      minutesDeducted,
      remainingMinutes,
    }
  }
}
