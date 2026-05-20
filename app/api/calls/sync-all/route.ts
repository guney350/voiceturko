/**
 * Tüm aramaları VAPI'den sync et (v3 - Aggressive Mode)
 *
 * Kapsadığı senaryolar:
 * 1. Stuck campaign_items (calling/locked) - durumu güncelle
 * 2. Orphan completed/failed items (calls'a kayıt yok) - calls'a ekle
 * 3. Calls without transcript/summary - VAPI'den çek ve güncelle
 * 4. Calls without webhook_processed_at - tamamlama akışını tetikle
 *
 * Son 24 saat: tüm aktif/stuck
 * Son 7 gün: transcript/summary boş olanlar (force fill)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VapiClient } from '@/lib/vapi/client'
import { completeCall } from '@/lib/vapi/call-lifecycle'

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // 1. Aktif/stuck campaign_items (son 24 saat)
    const { data: items } = await adminSupabase
      .from('campaign_items')
      .select('id, customer_name, customer_phone, vapi_call_id, vapi_account_id, status, campaign_id, campaigns!inner(user_id, assistant_id)')
      .eq('campaigns.user_id', user.id)
      .not('vapi_call_id', 'is', null)
      .in('status', ['calling', 'locked', 'pending', 'retry_wait', 'completed', 'failed'])
      .gt('called_at', since24h)

    // 1.5 ORPHAN FIX: campaign_items completed/failed ama calls tablosunda kaydı yok -> ekle
    if (items && items.length > 0) {
      const itemVapiIds = items.map(i => i.vapi_call_id).filter(Boolean) as string[]
      if (itemVapiIds.length > 0) {
        const { data: existingCallIds } = await adminSupabase
          .from('calls')
          .select('vapi_call_id')
          .in('vapi_call_id', itemVapiIds)

        const existingSet = new Set((existingCallIds || []).map(c => c.vapi_call_id))
        const orphans = items.filter(i =>
          i.vapi_call_id && !existingSet.has(i.vapi_call_id)
        )

        for (const orphan of orphans) {
          const campaigns = Array.isArray(orphan.campaigns) ? orphan.campaigns[0] : orphan.campaigns
          const { error: orphanErr } = await adminSupabase.from('calls').insert({
            user_id: campaigns?.user_id || user.id,
            vapi_call_id: orphan.vapi_call_id,
            vapi_account_id: orphan.vapi_account_id,
            campaign_item_id: orphan.id,
            customer_name: orphan.customer_name,
            customer_number: orphan.customer_phone,
            call_type: 'outboundPhoneCall',
            status: orphan.status === 'completed' ? 'ended' : 'queued',
            assistant_id: campaigns?.assistant_id,
            duration_minutes: 0,
            duration_seconds: 0,
            audio: '',
          })
          if (orphanErr) {
            console.error('[sync-all] orphan insert failed:', orphanErr.message, orphan.vapi_call_id)
          }
        }
      }
    }

    // 2. Calls: webhook_processed_at NULL VEYA transcript NULL (son 7 gün)
    const { data: calls } = await adminSupabase
      .from('calls')
      .select('vapi_call_id, vapi_account_id, webhook_processed_at, transcript, summary, status, id')
      .eq('user_id', user.id)
      .not('vapi_call_id', 'is', null)
      .or('webhook_processed_at.is.null,transcript.is.null,summary.is.null')
      .gt('created_at', since7d)
      .limit(100)

    // İşlenecek arama listesi (deduplicate)
    type CallToProcess = { vapiCallId: string; vapiAccountId: string }
    const toProcess = new Map<string, CallToProcess>()

    for (const item of items || []) {
      if (item.vapi_call_id && item.vapi_account_id) {
        toProcess.set(item.vapi_call_id, {
          vapiCallId: item.vapi_call_id,
          vapiAccountId: item.vapi_account_id,
        })
      }
    }

    for (const call of calls || []) {
      if (call.vapi_call_id && call.vapi_account_id) {
        toProcess.set(call.vapi_call_id, {
          vapiCallId: call.vapi_call_id,
          vapiAccountId: call.vapi_account_id,
        })
      }
    }

    // vapi_account_id yoksa kullanıcının assigned key'lerinden dene
    const callsWithoutAccount = (calls || []).filter(c => c.vapi_call_id && !c.vapi_account_id)
    if (callsWithoutAccount.length > 0) {
      const { data: userKeys } = await adminSupabase
        .from('user_pool_assignments')
        .select('vapi_account_id, vapi_accounts!inner(id, api_key, is_active)')
        .eq('user_id', user.id)
        .eq('is_active', true)

      const accounts = (userKeys || [])
        .map(uk => Array.isArray(uk.vapi_accounts) ? uk.vapi_accounts[0] : uk.vapi_accounts)
        .filter(a => a && a.is_active) as Array<{ id: string; api_key: string }>

      // Her bir orphan call için, hangi key'in sahibi olduğunu VAPI'ye sorarak bul
      for (const call of callsWithoutAccount) {
        for (const acc of accounts) {
          try {
            const client = new VapiClient(acc.api_key)
            const vapiCall = await client.getCall(call.vapi_call_id)
            if (vapiCall?.id) {
              // Bulundu - bu key'i kaydet
              await adminSupabase
                .from('calls')
                .update({ vapi_account_id: acc.id })
                .eq('id', call.id)
              toProcess.set(call.vapi_call_id, {
                vapiCallId: call.vapi_call_id,
                vapiAccountId: acc.id,
              })
              break
            }
          } catch {
            // bu key'de değil, sıradakine geç
          }
        }
      }
    }

    if (toProcess.size === 0) {
      return NextResponse.json({
        success: true,
        synced: 0,
        message: 'Senkronize edilecek arama bulunamadı',
      })
    }

    // API key'leri toplu çek
    const accountIds = [...new Set([...toProcess.values()].map(p => p.vapiAccountId))]
    const { data: accounts } = await adminSupabase
      .from('vapi_accounts')
      .select('id, api_key')
      .in('id', accountIds)

    const accountKeyMap = new Map((accounts || []).map(a => [a.id, a.api_key]))

    let synced = 0
    let stillActive = 0
    let forceFixed = 0
    let transcriptFilled = 0
    const errors: string[] = []

    // Paralel sorgu (10'lu batch'ler halinde)
    const entries = [...toProcess.values()]
    for (let i = 0; i < entries.length; i += 10) {
      const batch = entries.slice(i, i + 10)
      await Promise.allSettled(
        batch.map(async (entry) => {
          try {
            const apiKey = accountKeyMap.get(entry.vapiAccountId)
            if (!apiKey) return

            const client = new VapiClient(apiKey)
            const call = await client.getCall(entry.vapiCallId)

            if (!call?.id) return

            const isFinished =
              call.endedAt ||
              call.status === 'ended' ||
              call.status === 'completed' ||
              call.status === 'failed'

            if (isFinished) {
              // 1) completeCall ile billing/counters/transcript/summary akışı
              const result = await completeCall({
                vapiCallId: call.id,
                source: 'polling',
                callPayload: call,
                artifact: call.artifact,
                endedReason: call.endedReason,
                analysis: call.analysis,
              })
              synced++

              const callData = call as { endedReason?: string; status?: string; duration?: number; startedAt?: string; endedAt?: string; artifact?: { transcript?: string; recordingUrl?: string; messages?: unknown[] }; analysis?: { summary?: string; successEvaluation?: string }; cost?: number; costBreakdown?: unknown; customer?: { name?: string; number?: string } }

              // 2) Süre hesapla
              let durationSeconds = 0
              if (callData.startedAt && callData.endedAt) {
                durationSeconds = Math.round(
                  (new Date(callData.endedAt).getTime() - new Date(callData.startedAt).getTime()) / 1000
                )
              } else if (typeof callData.duration === 'number') {
                durationSeconds = Math.round(callData.duration)
              }

              const endedReason = callData.endedReason || ''
              const isSuccess = !endedReason.includes('error') && !endedReason.includes('failed') && callData.status !== 'failed'

              // 3) Eğer completeCall skipped olduysa veya transcript/summary hala bosşa, force update
              const transcript = callData.artifact?.transcript || ''
              const vapiSummary = callData.analysis?.summary || ''
              const successEvaluation = callData.analysis?.successEvaluation || ''
              const finalAnalysis = successEvaluation
                ? `Değerlendirme: ${successEvaluation}\n\nÖzet: ${vapiSummary}`
                : vapiSummary
              const recordingUrl = callData.artifact?.recordingUrl || ''

              // Customer info
              const customerName = callData.customer?.name
              const customerNumber = callData.customer?.number

              // FORCE FILL: transcript/summary bos olan kayitlari guncelle
              if (transcript || vapiSummary) {
                const updatePayload: Record<string, unknown> = {
                  status: 'ended',
                  ended_reason: endedReason || null,
                  duration_seconds: durationSeconds,
                  duration_minutes: durationSeconds / 60,
                  audio: recordingUrl || null,
                  recording_url: recordingUrl || null,
                }
                if (transcript) updatePayload.transcript = transcript
                if (vapiSummary) updatePayload.summary = vapiSummary
                if (finalAnalysis) updatePayload.analysis = finalAnalysis

                // Mevcut kaydı oku - bos alanlari doldur (overwrite etme)
                const { data: existing } = await adminSupabase
                  .from('calls')
                  .select('id, transcript, summary, customer_name, customer_number')
                  .eq('vapi_call_id', call.id)
                  .maybeSingle()

                if (existing) {
                  // Eger zaten transcript varsa, dokunma
                  if (existing.transcript && !transcript) delete updatePayload.transcript
                  if (existing.summary && !vapiSummary) delete updatePayload.summary
                  if (!existing.customer_name && customerName) updatePayload.customer_name = customerName
                  if (!existing.customer_number && customerNumber) updatePayload.customer_number = customerNumber

                  await adminSupabase
                    .from('calls')
                    .update(updatePayload)
                    .eq('id', existing.id)
                  transcriptFilled++
                }
              }

              // 4) Stuck campaign_item'lari zorla guncelle
              if (result.skipped) {
                const { data: stuckItem } = await adminSupabase
                  .from('campaign_items')
                  .select('id, status, campaign_id')
                  .eq('vapi_call_id', call.id)
                  .maybeSingle()

                if (stuckItem && (stuckItem.status === 'calling' || stuckItem.status === 'locked')) {
                  await adminSupabase
                    .from('campaign_items')
                    .update({
                      status: isSuccess ? 'completed' : 'failed',
                      completed_at: new Date().toISOString(),
                      call_duration: durationSeconds,
                      error_message: !isSuccess ? endedReason : null,
                    })
                    .eq('id', stuckItem.id)
                  forceFixed++

                  if (stuckItem.campaign_id) {
                    const { error: rpcErr } = await adminSupabase.rpc('update_campaign_counters', {
                      p_campaign_id: stuckItem.campaign_id,
                      p_completed_delta: 1,
                      p_successful_delta: isSuccess ? 1 : 0,
                      p_failed_delta: isSuccess ? 0 : 1,
                      p_pending_delta: -1,
                      p_active_delta: -1,
                    })
                    if (rpcErr) {
                      const { data: camp } = await adminSupabase
                        .from('campaigns')
                        .select('completed_calls, successful_calls, failed_calls, pending_calls, active_call_count')
                        .eq('id', stuckItem.campaign_id)
                        .single()
                      if (camp) {
                        await adminSupabase
                          .from('campaigns')
                          .update({
                            completed_calls: (camp.completed_calls || 0) + 1,
                            successful_calls: (camp.successful_calls || 0) + (isSuccess ? 1 : 0),
                            failed_calls: (camp.failed_calls || 0) + (isSuccess ? 0 : 1),
                            pending_calls: Math.max(0, (camp.pending_calls || 0) - 1),
                            active_call_count: Math.max(0, (camp.active_call_count || 0) - 1),
                          })
                          .eq('id', stuckItem.campaign_id)
                      }
                    }
                  }
                }
              }
            } else {
              stillActive++
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Unknown'
            errors.push(`${entry.vapiCallId.substring(0, 8)}: ${msg}`)
          }
        })
      )
    }

    return NextResponse.json({
      success: true,
      synced,
      forceFixed,
      transcriptFilled,
      stillActive,
      total: toProcess.size,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('sync-all error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
