/**
 * Campaign Watchdog - Cron Job
 *
 * Bu endpoint cron servisi tarafından (Vercel Cron, GitHub Actions, vb.)
 * düzenli olarak çağrılmalıdır.
 *
 * Yaptığı işler:
 * 1. Heartbeat'i eski olan running kampanyaları paused yapar
 * 2. Tamamlanmış (pending=0, calling=0, locked=0) kampanyaları completed yapar
 * 3. Süresi dolmuş kilitleri pending'e geri çevirir
 * 4. Timeout olan aramaları kurtarır + counter sızıntısını önler
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VapiPoolManager } from '@/lib/vapi/pool-manager'
import { VapiClient } from '@/lib/vapi/client'
import { completeCall } from '@/lib/vapi/call-lifecycle'

const STALE_HEARTBEAT_MS = 60_000          // 60 sn - heartbeat eski sayma eşiği
const LOCK_TTL_MS = 120_000                // 2 dk - processor ile aynı TTL
const CALL_TIMEOUT_MS = 300_000            // 5 dk - arama timeout

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const recovered = {
      staleJobs: 0,
      stalledItems: 0,
      timedOutCalls: 0,
      completedJobs: 0,
    }

    // 1. Heartbeat'i eski olan running kampanyaları paused yap
    const { data: staleJobs } = await supabase
      .from('campaigns')
      .select('id')
      .eq('status', 'running')
      .lt('last_heartbeat_at', new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString())

    for (const job of staleJobs || []) {
      await supabase
        .from('campaigns')
        .update({
          status: 'paused',
          paused_at: new Date().toISOString(),
          pause_reason: 'stale_heartbeat',
        })
        .eq('id', job.id)

      recovered.staleJobs++
    }

    // 2. Süresi dolmuş kilitleri temizle (processor ile aynı TTL)
    const { data: expiredLocks } = await supabase
      .from('campaign_items')
      .select('id, stall_count')
      .eq('status', 'locked')
      .lt('lock_expires_at', new Date().toISOString())

    for (const item of expiredLocks || []) {
      await supabase
        .from('campaign_items')
        .update({
          status: 'pending',
          locked_at: null,
          lock_expires_at: null,
          worker_id: null,
          stall_count: (item.stall_count || 0) + 1,
        })
        .eq('id', item.id)

      recovered.stalledItems++
    }

    // 3. Timeout olan aramalari kurtar
    // ONEMLI: Once VAPI'ye sor - eger gercekten bitmis ise completeCall (counter race yok)
    // Hala aktif ise: timeout uzat (zarar verme) veya VAPI'den de gelecek yanit yok ise fail
    const { data: timedOutCalls } = await supabase
      .from('campaign_items')
      .select('id, campaign_id, attempt_count, vapi_account_id, vapi_call_id')
      .eq('status', 'calling')
      .lt('call_timeout_at', new Date().toISOString())

    for (const item of timedOutCalls || []) {
      // VAPI'de gercekten durumu nedir?
      let vapiFinished = false
      if (item.vapi_call_id && item.vapi_account_id) {
        try {
          const { data: acc } = await supabase
            .from('vapi_accounts')
            .select('api_key')
            .eq('id', item.vapi_account_id)
            .single()
          if (acc?.api_key) {
            const client = new VapiClient(acc.api_key)
            const vCall = await client.getCall(item.vapi_call_id)
            const isFinished = vCall.endedAt || ['ended', 'completed', 'failed'].includes(vCall.status || '')
            if (isFinished) {
              vapiFinished = true
              // completeCall ile temiz akis (idempotent: claim_call_webhook race-free)
              await completeCall({
                vapiCallId: vCall.id,
                source: 'watchdog',
                callPayload: vCall,
                artifact: vCall.artifact,
                endedReason: vCall.endedReason,
                analysis: vCall.analysis,
              })
              recovered.timedOutCalls++
              continue
            }
          }
        } catch (err) {
          console.warn('[watchdog] VAPI fetch hatasi:', err instanceof Error ? err.message : err)
        }
      }

      // VAPI'de hala aktif veya bilgi alinamadi - timeout'u uzat (10dk daha bekle)
      // Eger 2. timeout'ta da bitmemisse retry/fail yapilir
      const newTimeout = new Date(Date.now() + 10 * 60_000).toISOString()
      const attemptCount = (item.attempt_count ?? 0)

      if (!vapiFinished && attemptCount < 3) {
        // Sadece timeout'u uzat
        await supabase
          .from('campaign_items')
          .update({ call_timeout_at: newTimeout })
          .eq('id', item.id)
        recovered.timedOutCalls++
      } else {
        // Max attempt asildi - fail + counter dus
        if (item.vapi_account_id) {
          try { await VapiPoolManager.decrementActiveCall(item.vapi_account_id) } catch {}
        }
        await supabase.rpc('update_campaign_counters', {
          p_campaign_id: item.campaign_id,
          p_completed_delta: 1,
          p_successful_delta: 0,
          p_failed_delta: 1,
          p_pending_delta: -1,
          p_active_delta: -1,
        }).then(() => {}, () => {})

        await supabase
          .from('campaign_items')
          .update({
            status: 'failed',
            error_message: 'Call timeout - max attempts (watchdog)',
            completed_at: new Date().toISOString(),
            locked_at: null,
            lock_expires_at: null,
            worker_id: null,
          })
          .eq('id', item.id)

        recovered.timedOutCalls++
      }
    }

    // 4. Tamamlanmış kampanyaları işaretle
    // KOŞUL: pending=0, calling=0, locked=0, retry_wait=0
    const { data: runningJobs } = await supabase
      .from('campaigns')
      .select('id')
      .eq('status', 'running')

    for (const job of runningJobs || []) {
      const { count: incomplete } = await supabase
        .from('campaign_items')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', job.id)
        .in('status', ['pending', 'calling', 'locked', 'retry_wait'])

      if ((incomplete || 0) === 0) {
        await supabase
          .from('campaigns')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        await supabase.from('campaign_logs').insert({
          campaign_id: job.id,
          level: 'success',
          message: 'Kampanya tamamlandı (otomatik sistem kontrolü)',
        })

        recovered.completedJobs++
      }
    }

    // 5. COUNTER SELF-HEALING: vapi_accounts.current_active_calls'i gercek deger ile eslestir
    // Sebep: webhook/decrement basarisizliklari sonucu sayac sizmis olabilir.
    const { data: leakyAccounts } = await supabase
      .from('vapi_accounts')
      .select('id, current_active_calls')
      .gt('current_active_calls', 0)

    let counterLeaks = 0
    for (const acc of (leakyAccounts || [])) {
      const { count: realActive } = await supabase
        .from('campaign_items')
        .select('id', { count: 'exact', head: true })
        .eq('vapi_account_id', acc.id)
        .in('status', ['calling', 'locked'])

      if ((realActive || 0) !== acc.current_active_calls) {
        await supabase
          .from('vapi_accounts')
          .update({ current_active_calls: realActive || 0 })
          .eq('id', acc.id)
        counterLeaks++
      }
    }

    // 6. campaigns.active_call_count self-healing
    const { data: leakyCampaigns } = await supabase
      .from('campaigns')
      .select('id, active_call_count')
      .gt('active_call_count', 0)

    let campaignLeaks = 0
    for (const c of (leakyCampaigns || [])) {
      const { count: realActive } = await supabase
        .from('campaign_items')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', c.id)
        .in('status', ['calling', 'locked'])

      if ((realActive || 0) !== c.active_call_count) {
        await supabase
          .from('campaigns')
          .update({ active_call_count: realActive || 0 })
          .eq('id', c.id)
        campaignLeaks++
      }
    }

    return NextResponse.json({
      success: true,
      recovered: {
        ...recovered,
        accountCounterLeaks: counterLeaks,
        campaignCounterLeaks: campaignLeaks,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Watchdog error:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
