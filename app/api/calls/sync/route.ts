import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VapiClient, VapiCallDetail } from '@/lib/vapi/client'
import { MinuteTracker } from '@/lib/minute-tracker'

function extractCallRecord(vapiCall: VapiCallDetail) {
  const startedAt = vapiCall.startedAt ? new Date(vapiCall.startedAt) : null
  const endedAt = vapiCall.endedAt ? new Date(vapiCall.endedAt) : null
  let durationSeconds = 0
  if (startedAt && endedAt) {
    durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
  }

  const transcript = vapiCall.artifact?.transcript || null
  const recordingUrl = vapiCall.artifact?.recordingUrl || vapiCall.artifact?.recording?.url || null
  const messages = vapiCall.artifact?.messages || null

  const vapiSummary = vapiCall.analysis?.summary || null
  const successEval = vapiCall.analysis?.successEvaluation || null
  const analysis = successEval
    ? `Değerlendirme: ${successEval}${vapiSummary ? `\n\nÖzet: ${vapiSummary}` : ''}`
    : vapiSummary

  return {
    vapi_call_id: vapiCall.id,
    status: vapiCall.status,
    call_type: vapiCall.type || 'outboundPhoneCall',
    customer_number: vapiCall.customer?.number || null,
    customer_name: vapiCall.customer?.name || null,
    assistant_id: vapiCall.assistantId || null,
    started_at: vapiCall.startedAt || null,
    ended_at: vapiCall.endedAt || null,
    duration_seconds: durationSeconds,
    duration_minutes: durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : 0,
    cost: vapiCall.cost || 0,
    cost_breakdown: vapiCall.costBreakdown || null,
    ended_reason: vapiCall.endedReason || null,
    transcript,
    summary: vapiSummary,
    analysis,
    recording_url: recordingUrl,
    audio: recordingUrl || '',
    messages,
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createAdminClient()

    const { data: items } = await adminSupabase
      .from('campaign_items')
      .select('vapi_call_id, vapi_account_id, customer_name, customer_phone, campaigns!inner(user_id)')
      .eq('campaigns.user_id', user.id)
      .not('vapi_call_id', 'is', null)
      .in('status', ['calling', 'completed', 'failed'])
      .order('called_at', { ascending: false })
      .limit(50)

    if (!items || items.length === 0) {
      return NextResponse.json({ synced: 0, message: 'Senkronize edilecek arama yok' })
    }

    const { data: existingCalls } = await adminSupabase
      .from('calls')
      .select('vapi_call_id')
      .eq('user_id', user.id)

    const existingCallIds = new Set((existingCalls || []).map(c => c.vapi_call_id))
    const completedCallIds = new Set<string>()
    existingCalls?.forEach(c => {
      if (c.vapi_call_id) completedCallIds.add(c.vapi_call_id)
    })

    const { data: existingFullCalls } = await adminSupabase
      .from('calls')
      .select('vapi_call_id, status, transcript')
      .eq('user_id', user.id)

    const needsUpdateIds = new Set<string>()
    existingFullCalls?.forEach(c => {
      if (c.vapi_call_id && (c.status === 'queued' || c.status === 'ringing' || c.status === 'in-progress' || !c.transcript)) {
        needsUpdateIds.add(c.vapi_call_id)
      }
    })

    const itemsToSync = items.filter(item =>
      item.vapi_call_id && (!existingCallIds.has(item.vapi_call_id) || needsUpdateIds.has(item.vapi_call_id))
    )

    if (itemsToSync.length === 0) {
      return NextResponse.json({ synced: 0, message: 'Tüm aramalar zaten senkronize' })
    }

    const keyMap = new Map<string, string[]>()
    for (const item of itemsToSync) {
      const keyId = item.vapi_account_id
      if (!keyId || !item.vapi_call_id) continue
      if (!keyMap.has(keyId)) keyMap.set(keyId, [])
      keyMap.get(keyId)!.push(item.vapi_call_id)
    }

    const { data: vapiKeys } = await adminSupabase
      .from('vapi_accounts')
      .select('id, api_key')
      .in('id', [...keyMap.keys()])

    if (!vapiKeys || vapiKeys.length === 0) {
      return NextResponse.json({ synced: 0, message: 'API key bulunamadı' })
    }

    let synced = 0
    const errors: string[] = []

    for (const key of vapiKeys) {
      const callIds = keyMap.get(key.id) || []
      const client = new VapiClient(key.api_key)

      for (const callId of callIds) {
        try {
          const vapiCall = await client.getCall(callId)
          if (!vapiCall || !vapiCall.id) continue

          const record = extractCallRecord(vapiCall)
          const item = itemsToSync.find(i => i.vapi_call_id === callId)

          if (existingCallIds.has(callId)) {
            await adminSupabase
              .from('calls')
              .update({
                ...record,
                customer_name: record.customer_name || (item as any)?.customer_name || null,
                customer_number: record.customer_number || (item as any)?.customer_phone || null,
              })
              .eq('vapi_call_id', callId)
              .eq('user_id', user.id)
          } else {
            const { data: subscription } = await adminSupabase
              .from('subscriptions')
              .select('id')
              .eq('user_id', user.id)
              .eq('status', 'active')
              .single()

            await adminSupabase
              .from('calls')
              .insert({
                user_id: user.id,
                subscription_id: subscription?.id || null,
                vapi_account_id: key.id,
                campaign_item_id: (item as any)?.id || null,
                customer_name: record.customer_name || (item as any)?.customer_name || null,
                customer_number: record.customer_number || (item as any)?.customer_phone || null,
                ...record,
              })

            if (record.duration_seconds > 0 && vapiCall.status === 'ended') {
              try {
                await MinuteTracker.recordCallAndDeductMinutes(user.id, {
                  vapiCallId: callId,
                  durationSeconds: record.duration_seconds,
                  transcript: record.transcript || '',
                  summary: record.summary || '',
                  analysis: record.analysis || '',
                  endedReason: record.ended_reason || '',
                  recordingUrl: record.recording_url || '',
                  vapiAccountId: key.id,
                })
              } catch {
                // Zaten kaydedilmiş olabilir
              }
            }
          }
          synced++
        } catch (err: any) {
          errors.push(`${callId.substring(0, 8)}: ${err.message}`)
        }
      }
    }

    // Sync sonrası her key'in total_spent'ini güncelle
    if (synced > 0) {
      for (const key of vapiKeys) {
        try {
          const { data: costData } = await adminSupabase
            .from('calls')
            .select('cost')
            .eq('vapi_account_id', key.id)
            .not('cost', 'is', null)

          const totalSpent = (costData || []).reduce((s: number, c: any) => s + (parseFloat(c.cost) || 0), 0)

          await adminSupabase
            .from('vapi_accounts')
            .update({ total_spent: totalSpent })
            .eq('id', key.id)
        } catch {
          // Harcama güncelleme hatası önemsiz
        }
      }
    }

    return NextResponse.json({ synced, errors: errors.length > 0 ? errors : undefined })
  } catch (error: any) {
    console.error('Call sync error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
