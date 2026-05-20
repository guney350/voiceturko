/**
 * Call Lifecycle Helper
 *
 * Tek noktadan çağrı sonu işlemleri.
 * Webhook, polling fallback ve watchdog hepsi bunu çağırır.
 *
 * Idempotent: aynı vapi_call_id için tekrar çağrılırsa hiçbir şey yapmaz.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { VapiPoolManager } from './pool-manager'
import { VapiClient, VapiCallDetail } from './client'
import { MinuteTracker } from '@/lib/minute-tracker'
import { Billing } from '@/lib/billing'
import { KeyRotation } from './key-rotation'

export interface CompleteCallOptions {
  vapiCallId: string
  source: 'webhook' | 'polling' | 'watchdog'
  // İsteğe bağlı: webhook'tan gelen veriler (tekrar VAPI'ye sormamak için)
  callPayload?: VapiCallDetail | Record<string, unknown>
  artifact?: Record<string, unknown>
  endedReason?: string
  analysis?: Record<string, unknown>
}

export interface CompleteCallResult {
  success: boolean
  skipped?: boolean
  reason?: string
  callId?: string
  durationSeconds?: number
}

/**
 * Çağrıyı tamamlanmış olarak işle. Idempotent.
 *
 * Sırasıyla:
 * 1. Aynı vapi_call_id için zaten işlenmiş mi? → skip
 * 2. campaign_items kaydını bul
 * 3. VAPI'den son durumu çek (eğer payload yoksa)
 * 4. Süreyi/transcript/summary hesapla
 * 5. campaign_items güncelle (completed/failed)
 * 6. campaigns sayaçlarını güncelle
 * 7. vapi_accounts.current_active_calls atomic decrement
 * 8. MinuteTracker.recordCallAndDeductMinutes
 * 9. pool_usage_logs insert
 * 10. campaign_logs insert
 * 11. calls.webhook_processed_at = now()
 */
export async function completeCall(opts: CompleteCallOptions): Promise<CompleteCallResult> {
  const supabase = createAdminClient()
  const { vapiCallId, source } = opts

  // 1. Atomic claim: aynı call için 2 paralel completeCall'dan sadece 1'i geçer
  const { data: claimResult, error: claimErr } = await supabase.rpc('claim_call_webhook', {
    p_vapi_call_id: vapiCallId,
  })

  if (claimErr) {
    // RPC hatasi - idempotency garantisi olmaz, guvenle skip et
    console.error(`[completeCall:${source}] claim_call_webhook RPC hatasi:`, claimErr.message)
    return { success: false, skipped: true, reason: 'claim_rpc_error' }
  }

  if (claimResult && !claimResult.claimed) {
    // Ya hiç kayıt yok ya da zaten işlenmiş
    // Kayıt henüz yoksa (initial insert henüz olmamış), webhook'tan gelmişsek bilgi yetersiz - skip
    const { data: existing } = await supabase
      .from('calls')
      .select('id, webhook_processed_at')
      .eq('vapi_call_id', vapiCallId)
      .maybeSingle()

    if (existing?.webhook_processed_at) {
      return {
        success: true,
        skipped: true,
        reason: 'already_processed',
        callId: existing.id,
      }
    }

    // Kayıt yoksa: insert henüz gelmemiş demektir. Webhook için skip et,
    // polling tekrar deneyecek (atomic claim olduğu için race-free)
    if (!existing) {
      return {
        success: false,
        skipped: true,
        reason: 'call_record_not_found_yet',
      }
    }
  }

  // Claim başarılı VEYA zaten işlenmemiş kayıt var - devam et
  // (claim_call_webhook sadece webhook_processed_at NULL ise işaretler)
  const { data: existingCall } = await supabase
    .from('calls')
    .select('id, webhook_processed_at, vapi_account_id, user_id')
    .eq('vapi_call_id', vapiCallId)
    .maybeSingle()

  // 2. Campaign item bul
  const { data: item } = await supabase
    .from('campaign_items')
    .select('*, campaigns(*)')
    .eq('vapi_call_id', vapiCallId)
    .maybeSingle()

  // 3. VAPI'den durumu çek (eğer payload yoksa)
  let callData: VapiCallDetail | Record<string, unknown> = opts.callPayload || {}
  let artifact: Record<string, unknown> = opts.artifact || {}
  let endedReason = opts.endedReason || ''
  let analysis: Record<string, unknown> = opts.analysis || {}

  if (!opts.callPayload && (item?.vapi_account_id || existingCall?.vapi_account_id)) {
    const accountId = item?.vapi_account_id || existingCall?.vapi_account_id
    const { data: account } = await supabase
      .from('vapi_accounts')
      .select('api_key')
      .eq('id', accountId)
      .single()

    if (account?.api_key) {
      try {
        const client = new VapiClient(account.api_key)
        const fetched = await client.getCall(vapiCallId)
        callData = fetched
        artifact = (fetched.artifact || {}) as Record<string, unknown>
        endedReason = fetched.endedReason || endedReason
        analysis = (fetched.analysis || {}) as Record<string, unknown>
      } catch (err) {
        console.error(`[completeCall:${source}] VAPI fetch hatası:`, err)
      }
    }
  }

  // 4. Süre hesapla
  let durationSeconds = 0
  const startedAt = (callData as VapiCallDetail).startedAt
  const endedAt = (callData as VapiCallDetail).endedAt
  if (startedAt && endedAt) {
    durationSeconds = Math.round(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
    )
  } else if (typeof (callData as { duration?: number }).duration === 'number') {
    durationSeconds = Math.round((callData as { duration: number }).duration)
  }

  // 5. Transcript/summary
  const transcript = ((artifact.transcript as string) || '') as string
  const messages = artifact.messages as Array<{ role: string; message?: string; content?: string }> | undefined
  const recordingUrl = (
    (artifact.recordingUrl as string) ||
    ((artifact.recording as Record<string, unknown>)?.url as string) ||
    ((artifact.recording as Record<string, unknown>)?.mono as Record<string, unknown>)?.combinedUrl as string ||
    ''
  )

  let fallbackSummary = ''
  if (messages && messages.length > 0) {
    fallbackSummary = messages
      .slice(-4)
      .map(m => `${m.role}: ${m.message || m.content || ''}`)
      .join(' | ')
      .substring(0, 500)
  }

  const vapiSummary = analysis.summary as string | undefined
  const successEvaluation = analysis.successEvaluation as string | undefined
  const finalSummary = vapiSummary || fallbackSummary
  const finalAnalysis = successEvaluation
    ? `Değerlendirme: ${successEvaluation}\n\nÖzet: ${finalSummary}`
    : finalSummary

  // Başarı durumu
  const isSuccess = !endedReason.includes('error') &&
                    !endedReason.includes('failed') &&
                    (callData as { status?: string }).status !== 'failed'

  const userId = item?.campaigns?.user_id || existingCall?.user_id
  const accountId = item?.vapi_account_id || existingCall?.vapi_account_id

  // 6. Campaign item update
  if (item) {
    await supabase
      .from('campaign_items')
      .update({
        status: isSuccess ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        call_duration: durationSeconds,
        error_message: !isSuccess ? endedReason : null,
      })
      .eq('id', item.id)

    // 7. Campaign sayaçlar (ATOMIC - RPC ile)
    if (item.campaigns) {
      const c = item.campaigns
      await supabase.rpc('update_campaign_counters', {
        p_campaign_id: c.id,
        p_completed_delta: 1,
        p_successful_delta: isSuccess ? 1 : 0,
        p_failed_delta: isSuccess ? 0 : 1,
        p_pending_delta: -1,
        p_active_delta: -1,
      })
    }
  }

  // 8. Pool decrement (atomic)
  if (accountId) {
    try {
      await VapiPoolManager.decrementActiveCall(accountId)
    } catch (err) {
      console.error(`[completeCall:${source}] decrement hatası:`, err)
    }
  }

  // VAPI'den gelen customer bilgisi (boş kalmasın)
  const customer = (callData as { customer?: { number?: string; name?: string } }).customer
  const customerName = customer?.name || item?.customer_name
  const customerNumber = customer?.number || item?.customer_phone

  // 9. Calls tablosunu kaydet/guncelle + bakiye dus (Enterprise Billing)
  let callDbId: string | undefined
  if (userId && durationSeconds > 0) {
    try {
      const callRes = await MinuteTracker.recordCallAndDeductMinutes(userId, {
        vapiCallId,
        durationSeconds,
        transcript,
        summary: finalSummary,
        analysis: finalAnalysis,
        endedReason,
        recordingUrl,
        vapiAccountId: accountId,
        campaignItemId: item?.id,
        customerName,
        customerNumber,
      })
      callDbId = callRes.callId

      // Enterprise billing - paket dakika + kredi dus
      // (MinuteTracker sadece call metadata kaydeder, gercek bakiye burada dusulur)
      try {
        const deductResult = await Billing.deductForCall(userId, durationSeconds, callRes.callId)
        if (deductResult.success) {
          console.log(`[completeCall] Bakiye dusuldu: ${deductResult.minutes_from_package}dk paket + ${deductResult.credit_cost}TL kredi`)
        } else if (deductResult.reason) {
          console.warn(`[completeCall] Bakiye dusumu warning: ${deductResult.reason}`)
        }
      } catch (billingErr) {
        console.error('[completeCall] Billing hatasi:', billingErr instanceof Error ? billingErr.message : billingErr)
      }

      // VAPI key spending takibi - threshold asildiysa rotation tetikle
      // Aktif call varsa dokunma (rotation icinde kontrol var)
      if (accountId) {
        try {
          const { data: account } = await supabase
            .from('vapi_accounts')
            .select('total_spent, spending_limit, current_active_calls')
            .eq('id', accountId)
            .single()

          if (account && account.total_spent >= (account.spending_limit || 9.5)) {
            // Async rotate (mevcut cagri bekletilmez); rotation kendi icinde aktif call kontrolu yapar
            KeyRotation.rotateUserKey(userId, accountId, 'spending_limit_exceeded').catch(err => {
              console.error('[completeCall] Auto-rotation hatasi:', err instanceof Error ? err.message : err)
            })
          }
        } catch (e) {
          console.warn('[completeCall] spending check error:', e instanceof Error ? e.message : e)
        }
      }
    } catch (err) {
      console.error(`[completeCall:${source}] dakika dusme hatasi:`, err instanceof Error ? err.message : err)
    }
  } else if (userId) {
    // Süre yok ama yine de calls kaydını güncelle
    await supabase
      .from('calls')
      .update({
        ended_reason: endedReason,
        status: 'ended',
        recording_url: recordingUrl,
      })
      .eq('vapi_call_id', vapiCallId)
  }

  void callDbId

  // 10. Pool usage log
  if (accountId && userId) {
    await supabase.from('pool_usage_logs').insert({
      user_id: userId,
      vapi_account_id: accountId,
      vapi_call_id: vapiCallId,
      call_duration_seconds: durationSeconds,
      call_cost_minutes: Math.ceil(durationSeconds / 60),
      event_type: 'call_ended',
      metadata: {
        ended_reason: endedReason,
        is_success: isSuccess,
        source,
      },
    }).then(() => {}, () => {})
  }

  // 11. Campaign log
  if (item) {
    await supabase.from('campaign_logs').insert({
      campaign_id: item.campaign_id,
      item_id: item.id,
      level: isSuccess ? 'success' : 'error',
      message: `${item.customer_name} — Arama ${isSuccess ? 'tamamlandı' : 'başarısız'} (${durationSeconds}s${endedReason ? `, ${endedReason}` : ''})`,
      details: { duration: durationSeconds, ended_reason: endedReason, has_transcript: !!transcript },
    }).then(() => {}, () => {})
  }

  // 12. Webhook processed marker artık claim_call_webhook RPC ile başta atomic yapıldı

  // 13. AUTO-COMPLETE CAMPAIGN: Eğer son arama bittiyse, kampanyayı anında tamamla
  if (item?.campaign_id && item.campaigns?.status === 'running') {
    const { count: incompleteCount } = await supabase
      .from('campaign_items')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', item.campaign_id)
      .in('status', ['pending', 'calling', 'locked', 'retry_wait'])

    if ((incompleteCount || 0) === 0) {
      await supabase
        .from('campaigns')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', item.campaign_id)

      await supabase.from('campaign_logs').insert({
        campaign_id: item.campaign_id,
        level: 'success',
        message: 'Kampanya tamamlandı (son arama bitirildi)',
      }).then(() => {}, () => {})
    }
  }

  return {
    success: true,
    callId: existingCall?.id,
    durationSeconds,
  }
}
