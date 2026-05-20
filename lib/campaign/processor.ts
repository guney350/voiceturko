import { createClient } from '@/lib/supabase/server'
import type { Campaign } from '@/lib/types/database.types'
import { VapiPoolManager } from '@/lib/vapi/pool-manager'
import { createAdminClient } from '@/lib/supabase/admin'
import { VapiClient } from '@/lib/vapi/client'
import { completeCall } from '@/lib/vapi/call-lifecycle'
import { Billing } from '@/lib/billing'
import { BUILTIN_RUNTIME_VARIABLES, type RuntimeVariable } from '@/lib/assistant-templates'

/**
 * Bir campaign item'dan VAPI assistantOverrides.variableValues üretir.
 * Asistan manifest'i + builtin keyler + customer_data merge edilir.
 * Boş değerler atlanır.
 */
function buildCallVariableValues(
  item: {
    customer_name?: string | null
    customer_phone?: string | null
    customer_data?: Record<string, unknown> | null
  },
  manifest?: RuntimeVariable[] | null
): Record<string, string> {
  const variables: RuntimeVariable[] = []
  const seen = new Set<string>()
  for (const v of (manifest || [])) {
    if (v?.key && !seen.has(v.key)) {
      variables.push(v)
      seen.add(v.key)
    }
  }
  for (const v of BUILTIN_RUNTIME_VARIABLES) {
    if (!seen.has(v.key)) {
      variables.push(v)
      seen.add(v.key)
    }
  }

  const data = item.customer_data || {}
  const result: Record<string, string> = {}

  for (const v of variables) {
    let val: string | undefined

    if (v.key === 'customerName') {
      val = (item.customer_name as string) || (data[v.key] as string) || v.fallback
    } else if (v.key === 'customerPhone') {
      val = (item.customer_phone as string) || (data[v.key] as string) || v.fallback
    } else if (v.key === 'customerGender') {
      val = (data[v.key] as string) || (data['gender'] as string) || v.fallback
    } else {
      val = (data[v.key] as string) || v.fallback
    }

    if (val !== undefined && val !== null && String(val).trim() !== '') {
      result[v.key] = String(val).trim()
    }
  }

  return result
}

export class CampaignProcessor {
  
  /**
   * Worker ID oluştur
   */
  private static generateWorkerId(): string {
    return `worker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
  
  /**
   * İdempotent tick - Ana işleme fonksiyonu
   */
  static async tick(campaignId: string, userId: string) {
    const supabase = await createClient()
    const workerId = this.generateWorkerId()
    
    try {
      // 1. Kampanyayı getir
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .eq('user_id', userId)
        .single()
      
      if (campaignError || !campaign) {
        return { success: false, error: 'Kampanya bulunamadı' }
      }
      
      // 2. Durum kontrolü
      if (campaign.status === 'completed') {
        return { success: true, done: true, message: 'Kampanya tamamlandı' }
      }
      
      if (campaign.status === 'cancelled') {
        return { success: true, done: true, message: 'Kampanya iptal edildi' }
      }
      
      if (campaign.status === 'paused') {
        return { success: false, paused: true, message: 'Kampanya duraklatıldı' }
      }
      
      // 3. Heartbeat güncelle
      await supabase
        .from('campaigns')
        .update({
          last_heartbeat_at: new Date().toISOString(),
          worker_id: workerId
        })
        .eq('id', campaignId)
      
      // 3.5 VAPI Webhook Fallback Polling (Localhost / Missed webhook kurtarma)
      try {
        await this.pollActiveCalls(campaignId)
      } catch (err) {
        console.error('Polling fallback error:', err)
      }
      
      // 4. Takılı öğeleri kurtar
      const recovered = await this.recoverStalledItems(campaignId)
      
      // 5. Global rate limit kontrolü
      const canProceed = await this.checkGlobalRateLimit(userId)
      if (!canProceed) {
        return {
          success: false,
          waiting: true,
          reason: 'global_rate_limit',
          message: 'Global arama limiti aşıldı'
        }
      }
      
      // 6. Sıradaki öğeleri paralel işle
      const result = await this.processNextBatch(campaignId, campaign, workerId)
      
      return {
        success: true,
        recovered,
        ...result
      }
    } catch (error: any) {
      console.error('Campaign tick error:', error)
      return { success: false, error: error.message }
    }
  }
  
  /**
   * Sıradaki öğeleri paralel işle (BATCH PROCESSING)
   */
  private static async processNextBatch(
    campaignId: string,
    campaign: Campaign,
    workerId: string
  ) {
    const supabase = await createClient()
    
    // Kaç arama başlatılabilir?
    const maxConcurrent = campaign.max_concurrent_calls || 10
    const currentActive = campaign.active_call_count || 0
    const availableSlots = Math.max(0, maxConcurrent - currentActive)
    
    if (availableSlots === 0) {
      return { waiting: true, message: 'Max concurrent calls reached' }
    }
    
    // Tüm öğeler tamamlandı mı kontrol et
    const { count: pendingCount } = await supabase
      .from('campaign_items')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'retry_wait'])
    
    if (pendingCount === 0) {
      // Aktif arama var mı kontrol et
      const { count: activeCount } = await supabase
        .from('campaign_items')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('status', 'calling')
      
      if (activeCount === 0) {
        await this.completeCampaign(campaignId)
        return { done: true, message: 'Tüm aramalar tamamlandı' }
      }
      
      return { waiting: true, message: 'Bekleyen öğe yok' }
    }
    
    // Batch size: Kullanılabilir slot kadar item al
    const batchSize = Math.min(availableSlots, pendingCount || 0)
    
    // Pending item'ları al
    const { data: pendingItems } = await supabase
      .from('campaign_items')
      .select('*')
      .eq('campaign_id', campaignId)
      .or('status.eq.pending,and(status.eq.retry_wait,next_retry_at.lt.' + new Date().toISOString() + ')')
      .order('call_order', { ascending: true })
      .limit(batchSize)
    
    if (!pendingItems || pendingItems.length === 0) {
      return { waiting: true, message: 'Bekleyen öğe yok' }
    }
    
    // Item'ları ATOMIK kilitle (race-free): sadece hala pending/retry_wait olanlari claim et
    const itemIds = pendingItems.map(i => i.id)
    const { data: lockedItems } = await supabase
      .from('campaign_items')
      .update({
        status: 'locked',
        locked_at: new Date().toISOString(),
        lock_expires_at: new Date(Date.now() + 120000).toISOString(),
        worker_id: workerId
      })
      .in('id', itemIds)
      .in('status', ['pending', 'retry_wait']) // ATOMIK guard - baska worker claim etmissse skip
      .select('id')

    const lockedIds = new Set((lockedItems || []).map(i => i.id))
    const actuallyLockedItems = pendingItems.filter(i => lockedIds.has(i.id))

    if (actuallyLockedItems.length === 0) {
      return { waiting: true, message: 'Tum item\'lar baska worker tarafindan alindi' }
    }

    // PARALEL ARAMA BAŞLAT (allSettled - bir item hata verirse digerleri etkilenmez)
    const callResults = await Promise.allSettled(
      actuallyLockedItems.map(item =>
        this.makeCall(item, campaign)
      )
    )
    const results = callResults.map((r, i) => {
      if (r.status === 'fulfilled') return r.value
      return {
        success: false,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        itemId: actuallyLockedItems[i].id
      }
    })

    // Active call count'u ATOMIK guncelle (RPC ile race-free)
    const successCount = results.filter(r => r.success).length
    if (successCount > 0) {
      const { error: rpcErr } = await supabase.rpc('update_campaign_counters', {
        p_campaign_id: campaignId,
        p_completed_delta: 0,
        p_successful_delta: 0,
        p_failed_delta: 0,
        p_pending_delta: 0,
        p_active_delta: successCount,
      })
      if (rpcErr) {
        // Fallback: yine de increment et (RPC yoksa)
        console.warn('[processor] update_campaign_counters RPC hatasi:', rpcErr.message)
      }
    }

    return {
      processed: results.length,
      successful: successCount,
      failed: results.length - successCount,
      results
    }
  }
  
  /**
   * VAPI araması yap
   */
  private static async makeCall(item: any, campaign: Campaign) {
    const supabase = await createClient()
    
    try {
      // 1. Bakiye kontrolü - Enterprise billing (paket dakika VEYA kredi yeterli mi?)
      const capacity = await Billing.getCallCapacity(campaign.user_id)
      if (!capacity.canCall) {
        throw new Error(capacity.reason || 'INSUFFICIENT_BALANCE: Bakiyeniz yetersiz, lütfen paket alın veya kredi yükleyin')
      }
      
      // 3. Telefon numarasını E.164 formatına çevir
      const formattedPhone = this.formatPhoneToE164(item.customer_phone)
      if (!formattedPhone) {
        throw new Error(`Geçersiz telefon numarası formatı: ${item.customer_phone}`)
      }

      // 2+4. Pool'dan key sec + atomik increment. CAPACITY_FULL ise siradaki key dene (max 3).
      const excludedKeys = new Set<string>()
      let resources: Awaited<ReturnType<typeof VapiPoolManager.getCallResources>> | null = null
      let lastError = ''
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          resources = await VapiPoolManager.getCallResources(
            campaign.user_id,
            campaign.assistant_id,
            0,
            { sipId: (campaign as { sip_id?: string | null }).sip_id || null, excludeKeyIds: excludedKeys }
          )

          const incResult = await VapiPoolManager.incrementActiveCall(resources.vapiAccountId)
          if (incResult.success) break

          // Bu key CAPACITY_FULL - excluded set'e ekle ve siradakini dene
          excludedKeys.add(resources.vapiAccountId)
          lastError = incResult.reason || 'CAPACITY_FULL'
          resources = null
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e)
          if (lastError.includes('POOL_CAPACITY_FULL') || lastError.includes('NO_ACTIVE_KEYS')) {
            break // Tum keyler dolu, vazgec
          }
          throw e
        }
      }

      if (!resources) {
        throw new Error(`POOL_CAPACITY_FULL: ${lastError} (3 key denendi)`)
      }

      console.log(`[processor] Call starting - item:${item.id?.substring(0, 8)} key:${resources.vapiAccountId.substring(0, 8)}`)
      
      // 5. Item'ı calling durumuna al ve hesap ID'sini kaydet
      const callTimeoutAt = new Date(Date.now() + 300000).toISOString() // 5 dakika
      
      await supabase
        .from('campaign_items')
        .update({
          status: 'calling',
          called_at: new Date().toISOString(),
          call_started_at: new Date().toISOString(),
          call_timeout_at: callTimeoutAt,
          attempt_count: (item.attempt_count ?? 0) + 1,
          vapi_account_id: resources.vapiAccountId
        })
        .eq('id', item.id)
      
      // 6. Asistanın runtime_variables manifest'ini al
      const { data: assistantRow } = await supabase
        .from('assistant')
        .select('runtime_variables, template_slug')
        .eq('id', campaign.assistant_id)
        .single()

      // 7. VariableValues oluştur (manifest + builtin + customer_data merge)
      const variableValues = buildCallVariableValues({
        customer_name: item.customer_name,
        customer_phone: formattedPhone,
        customer_data: item.customer_data,
      }, assistantRow?.runtime_variables)

      // 8. VAPI API çağrısı
      const callPayload: Record<string, unknown> = {
        type: 'outboundPhoneCall',
        customer: {
          number: formattedPhone,
          name: item.customer_name
        },
        assistantId: resources.vapiAssistantId,
        phoneNumberId: resources.vapiPhoneNumberId,
        assistantOverrides: {
          variableValues,
        }
      }
      
      // PII guvenligi: sadece kritik metadata loglanir (telefon/isim maskelenmis)
      console.log('[processor] VAPI call request:', {
        itemId: item.id,
        assistantId: resources.vapiAssistantId?.substring(0, 8),
        phoneNumberId: resources.vapiPhoneNumberId?.substring(0, 8),
        accountId: resources.vapiAccountId?.substring(0, 8),
        phoneMasked: formattedPhone?.substring(0, 5) + '***' + formattedPhone?.slice(-2),
      })

      const response = await fetch('https://api.vapi.ai/call', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resources.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(callPayload)
      })

      const data = await response.json()

      // Yanit logu: sadece id + status + error
      console.log(`[processor] VAPI response ${response.status}:`, {
        callId: data?.id?.substring(0, 8),
        status: data?.status,
        error: response.ok ? undefined : (data?.message || data?.error)?.substring(0, 200),
      })
      
      if (response.ok) {
        // Başarılı - Arama başladı
        await supabase
          .from('campaign_items')
          .update({
            vapi_call_id: data.id,
            status: 'calling'
          })
          .eq('id', item.id)
        
        // calls tablosuna ilk kaydı oluştur (detaylar sonra VAPI'den çekilecek)
        // ÖNEMLİ: assistant_id LOCAL DB UUID'si olmalı, VAPI ID değil (FK constraint)
        // ÖNEMLİ: duration_minutes NOT NULL'dur, 0 ile başlat (sonra güncellenir)
        const { error: callInsertErr } = await supabase.from('calls').insert({
          user_id: campaign.user_id,
          vapi_call_id: data.id,
          vapi_account_id: resources.vapiAccountId,
          campaign_item_id: item.id,
          customer_name: item.customer_name,
          customer_number: formattedPhone,
          call_type: 'outboundPhoneCall',
          status: data.status || 'queued',
          assistant_id: campaign.assistant_id, // LOCAL UUID (FK için)
          duration_minutes: 0,
          duration_seconds: 0,
          audio: '',
        })
        if (callInsertErr) {
          console.error('[processor] İlk call kaydı oluşturulamadı:', callInsertErr.message, callInsertErr.details)
        }

        await supabase.from('campaign_logs').insert({
          campaign_id: campaign.id,
          item_id: item.id,
          level: 'success',
          message: `${item.customer_name} (${formattedPhone}) aranıyor — Çağrı ID: ${data.id}`
        })
        
        console.log(`✅ Arama başarıyla başlatıldı: ${data.id}`)
        
        return { success: true, callId: data.id, accountId: resources.vapiAccountId }
      } else {
        // Hata - Arama başlamadı, kapasiteyi geri ver
        await VapiPoolManager.decrementActiveCall(resources.vapiAccountId)
        
        const errorMsg = data.message || data.error || 'Bilinmeyen hata'
        const errorDetail = JSON.stringify(data)
        
        console.error(`❌ VAPI API hatası (${response.status}):`, errorDetail)
        
        const isTransient = this.isTransientError(errorMsg)
        
        if (isTransient && item.attempt_count < 3) {
          await this.scheduleRetry(item.id, campaign.id, errorMsg)
          
          await supabase.from('campaign_logs').insert({
            campaign_id: campaign.id,
            item_id: item.id,
            level: 'warning',
            message: `${item.customer_name} (${formattedPhone}) — Yeniden deneme planlandı: ${errorMsg}`
          })
        } else {
          await this.markItemFailed(item.id, campaign.id, `${errorMsg} | Detail: ${errorDetail}`)
          
          await supabase.from('campaign_logs').insert({
            campaign_id: campaign.id,
            item_id: item.id,
            level: 'error',
            message: `${item.customer_name} (${formattedPhone}) — Başarısız: ${errorMsg}`
          })
        }
        
        return { success: false, error: errorMsg, errorDetail }
      }
    } catch (error: any) {
      console.error('makeCall error:', error)
      
      // Hata durumunda item'daki account_id'yi kontrol et ve kapasiteyi geri ver
      const { data: itemData } = await supabase
        .from('campaign_items')
        .select('vapi_account_id')
        .eq('id', item.id)
        .single()
      
      if (itemData?.vapi_account_id) {
        await VapiPoolManager.decrementActiveCall(itemData.vapi_account_id)
      }
      
      await this.markItemFailed(item.id, campaign.id, error.message)
      return { success: false, error: error.message }
    }
  }
  
  /**
   * Telefon numarasını E.164 formatına çevir
   * Türkiye numaraları için +90 ekler
   */
  private static formatPhoneToE164(phone: string): string | null {
    if (!phone) return null
    
    // Sadece rakamları al
    const cleaned = phone.replace(/\D/g, '')
    
    // Zaten + ile başlıyorsa olduğu gibi döndür
    if (phone.startsWith('+')) {
      return phone
    }
    
    // Türkiye numarası formatları:
    // 05551234567 (11 haneli, 0 ile başlayan)
    if (cleaned.length === 11 && cleaned.startsWith('0')) {
      return '+9' + cleaned // +905551234567
    }
    
    // 5551234567 (10 haneli, 0 olmadan)
    if (cleaned.length === 10 && cleaned.startsWith('5')) {
      return '+90' + cleaned // +905551234567
    }
    
    // 905551234567 (12 haneli, 90 ile başlayan)
    if (cleaned.length === 12 && cleaned.startsWith('90')) {
      return '+' + cleaned // +905551234567
    }
    
    // Diğer uluslararası formatlar için + ekle
    if (cleaned.length >= 10) {
      return '+' + cleaned
    }
    
    console.error(`❌ Geçersiz telefon formatı: ${phone} (cleaned: ${cleaned})`)
    return null
  }
  
  // getPhoneNumberId() kaldırıldı — artık VapiPoolManager.getCallResources() her şeyi sağlıyor
  
  /**
   * Takılı öğeleri kurtar
   */
  private static async recoverStalledItems(campaignId: string): Promise<number> {
    const supabase = await createClient()
    let recovered = 0
    
    // 1. Süresi dolmuş kilitleri temizle
    const { data: expiredLocks } = await supabase
      .from('campaign_items')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'locked')
      .lt('lock_expires_at', new Date().toISOString())
    
    if (expiredLocks && expiredLocks.length > 0) {
      for (const item of expiredLocks) {
        await supabase
          .from('campaign_items')
          .update({
            status: 'pending',
            locked_at: null,
            lock_expires_at: null,
            worker_id: null,
            stall_count: (item.stall_count || 0) + 1
          })
          .eq('id', item.id)
      }
    }
    
    recovered += expiredLocks?.length || 0
    
    // 2. Timeout olan aramaları kurtar
    const { data: timedOutCalls } = await supabase
      .from('campaign_items')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'calling')
      .lt('call_timeout_at', new Date().toISOString())
    
    for (const item of timedOutCalls || []) {
      await this.handleCallTimeout(item, campaignId)
      recovered++
    }
    
    return recovered
  }
  
  /**
   * Call timeout işle
   * C9 FIX: Önce VAPI'den durumu çek - eğer call hala VAPI'de aktif değilse completeCall (idempotent)
   * completeCall içinde claim_call_webhook RPC ile race-free decrement yapılır
   */
  private static async handleCallTimeout(item: any, campaignId: string) {
    const supabase = await createClient()

    // 1. Önce VAPI'ye soralım - call gerçekten devam ediyor mu?
    if (item.vapi_call_id && item.vapi_account_id) {
      try {
        const adminSb = createAdminClient()
        const { data: key } = await adminSb
          .from('vapi_accounts')
          .select('api_key')
          .eq('id', item.vapi_account_id)
          .single()

        if (key?.api_key) {
          const { VapiClient } = await import('@/lib/vapi/client')
          const client = new VapiClient(key.api_key)
          try {
            const call = await client.getCall(item.vapi_call_id)
            // Call bitmiş - completeCall ile kapat (atomic, idempotent)
            if (call.endedAt || ['ended', 'completed', 'failed'].includes(call.status || '')) {
              const { completeCall } = await import('@/lib/vapi/call-lifecycle')
              await completeCall({
                vapiCallId: call.id,
                source: 'watchdog',
                callPayload: call,
                artifact: call.artifact,
                endedReason: call.endedReason,
                analysis: call.analysis,
              })
              return // completeCall içinde counter düşürüldü
            }
          } catch {
            // VAPI ulaşılamadı - manuel kapat
          }
        }
      } catch {}
    }

    // 2. VAPI'ye ulaşılamadı veya call hala aktif görünüyor → manuel kapat
    // Pool decrement (atomic)
    if (item.vapi_account_id) {
      try {
        await VapiPoolManager.decrementActiveCall(item.vapi_account_id)
      } catch (err) {
        console.error('handleCallTimeout decrement error:', err)
      }
    }

    // Campaign active_call_count düşür (atomic RPC)
    const adminSb = createAdminClient()
    await adminSb.rpc('update_campaign_counters', {
      p_campaign_id: campaignId,
      p_active_delta: -1,
    })

    if (item.attempt_count < 3) {
      await this.scheduleRetry(item.id, campaignId, 'Call timeout')
    } else {
      await this.markItemFailed(item.id, campaignId, 'Call timeout - max attempts')
    }
  }

  /**
   * Retry planla
   * vapi_call_id temizlenir (eski referans kalmasın)
   */
  private static async scheduleRetry(itemId: string, campaignId: string, error: string) {
    const supabase = await createClient()
    const nextRetry = new Date(Date.now() + 30000).toISOString() // 30 saniye

    await supabase
      .from('campaign_items')
      .update({
        status: 'retry_wait',
        last_error: error,
        next_retry_at: nextRetry,
        locked_at: null,
        lock_expires_at: null,
        worker_id: null,
        vapi_call_id: null,
      })
      .eq('id', itemId)
  }

  /**
   * Item'ı başarısız olarak işaretle
   */
  private static async markItemFailed(itemId: string, campaignId: string, error: string) {
    const supabase = await createClient()

    await supabase
      .from('campaign_items')
      .update({
        status: 'failed',
        error_message: error,
        completed_at: new Date().toISOString(),
        locked_at: null,
        lock_expires_at: null,
        worker_id: null
      })
      .eq('id', itemId)

    // Kampanya sayaclarini ATOMIK guncelle (RPC ile race-free)
    const { error: rpcErr } = await supabase.rpc('update_campaign_counters', {
      p_campaign_id: campaignId,
      p_completed_delta: 1,
      p_successful_delta: 0,
      p_failed_delta: 1,
      p_pending_delta: -1,
      p_active_delta: 0,
    })
    if (rpcErr) {
      // Fallback (RPC yoksa) - eski mantik
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('completed_calls, failed_calls, pending_calls')
        .eq('id', campaignId)
        .single()
      if (campaign) {
        await supabase
          .from('campaigns')
          .update({
            completed_calls: (campaign.completed_calls || 0) + 1,
            failed_calls: (campaign.failed_calls || 0) + 1,
            pending_calls: Math.max(0, (campaign.pending_calls || 0) - 1)
          })
          .eq('id', campaignId)
      }
    }
  }
  
  /**
   * Kampanyayı tamamla
   */
  private static async completeCampaign(campaignId: string) {
    const supabase = await createClient()
    
    await supabase
      .from('campaigns')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', campaignId)
    
    await supabase.from('campaign_logs').insert({
      campaign_id: campaignId,
      level: 'success',
      message: 'Kampanya başarıyla tamamlandı'
    })
  }
  
  /**
   * Global rate limit kontrolü
   * system_settings'ten max_global_concurrent_calls okur
   */
  private static async checkGlobalRateLimit(userId: string): Promise<boolean> {
    const supabase = await createClient()

    // Kullanıcı bazlı: kendi tüm aktif aramaları
    const { count: userActive } = await supabase
      .from('campaign_items')
      .select('campaign_id, campaigns!inner(user_id)', { count: 'exact', head: true })
      .eq('status', 'calling')
      .eq('campaigns.user_id', userId)

    // System settings'ten oku (yoksa 100)
    const { data: settings } = await supabase
      .from('system_settings')
      .select('max_global_concurrent_calls')
      .eq('user_id', userId)
      .maybeSingle()

    const maxCalls = settings?.max_global_concurrent_calls || 100

    return (userActive || 0) < maxCalls
  }
  
  /**
   * Geçici hata mı kontrol et
   */
  private static isTransientError(error: string): boolean {
    const transientPatterns = [
      /timeout/i,
      /connection/i,
      /temporarily/i,
      /rate.?limit/i,
      /503/i,
      /502/i,
      /504/i,
      /busy/i
    ]
    
    return transientPatterns.some(pattern => pattern.test(error))
  }

  /**
   * VAPI Polling Fallback - Webhook olmadığı durumlarda aktif çağrıları VAPI'ye sorar.
   * Tek `completeCall` helper'ı kullanılır (idempotent).
   */
  private static async pollActiveCalls(campaignId: string) {
    const supabase = createAdminClient()
    const { data: activeItems } = await supabase
      .from('campaign_items')
      .select('id, vapi_call_id, vapi_account_id')
      .eq('campaign_id', campaignId)
      .eq('status', 'calling')
      .not('vapi_call_id', 'is', null)

    if (!activeItems || activeItems.length === 0) return

    for (const item of activeItems) {
      if (!item.vapi_account_id) continue

      const { data: key } = await supabase
        .from('vapi_accounts')
        .select('api_key')
        .eq('id', item.vapi_account_id)
        .single()

      if (!key) continue

      const client = new VapiClient(key.api_key)
      try {
        const call = await client.getCall(item.vapi_call_id)
        if (call.endedAt || call.status === 'ended' || call.status === 'completed' || call.status === 'failed') {
          console.log(`[Polling] Call ${call.id} VAPI'de bitmiş, completeCall çağrılıyor...`)
          await completeCall({
            vapiCallId: call.id,
            source: 'polling',
            callPayload: call,
            artifact: call.artifact,
            endedReason: call.endedReason,
            analysis: call.analysis,
          })
        }
      } catch (err) {
        console.error(`[Polling] Call ${item.vapi_call_id} sorgu hatası:`, err)
      }
    }
  }
}