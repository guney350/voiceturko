/**
 * VAPI Webhook Handler (v2 - Stabilized)
 *
 * Tüm "arama sonu" eventleri (end-of-call-report, call.ended, call.completed, call.failed)
 * tek `completeCall()` helper'ına yönlendirilir. Idempotent.
 *
 * status-update sadece "in-progress" için kullanılır (item'ı calling'e al).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { CampaignProcessor } from '@/lib/campaign/processor'
import { completeCall } from '@/lib/vapi/call-lifecycle'

export async function POST(request: Request) {
  try {
    // Webhook secret kontrolu
    // PRODUCTION: zorunlu (sahte webhook ile counter/billing manipulasyonunu onler)
    // DEV: opsiyonel (localhost'a VAPI webhook gondermez zaten)
    const webhookSecret = process.env.VAPI_WEBHOOK_SECRET
    const isProduction = process.env.NODE_ENV === 'production'

    if (isProduction && !webhookSecret) {
      console.error('[VAPI Webhook] FATAL: VAPI_WEBHOOK_SECRET production\'da zorunlu')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 503 })
    }

    if (webhookSecret) {
      const providedSecret = request.headers.get('x-vapi-secret') || request.headers.get('x-vapi-signature')
      if (providedSecret !== webhookSecret) {
        console.warn('[VAPI Webhook] Gecersiz secret - IP:', request.headers.get('x-forwarded-for'))
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const payload = await request.json()
    const supabase = createAdminClient()

    const messageType = payload.message?.type || payload.type
    const callData = payload.message?.call || payload.call || payload
    const message = payload.message || payload

    switch (messageType) {
      case 'end-of-call-report':
      case 'call.ended':
      case 'call.completed':
      case 'call.failed': {
        const callId = callData?.id
        if (!callId) {
          console.warn('[Webhook] call.id yok, atlanıyor')
          break
        }

        // Tek noktadan tamamlama
        await completeCall({
          vapiCallId: callId,
          source: 'webhook',
          callPayload: callData,
          artifact: message.artifact || callData?.artifact,
          endedReason: message.endedReason || callData?.endedReason,
          analysis: message.analysis || callData?.analysis,
        })

        // Sıradaki tick'i tetikle
        const { data: item } = await supabase
          .from('campaign_items')
          .select('campaign_id, campaigns(user_id)')
          .eq('vapi_call_id', callId)
          .maybeSingle()

        if (item?.campaigns) {
          const campaign = item.campaigns as Record<string, unknown>
          await CampaignProcessor.tick(item.campaign_id, campaign.user_id as string).catch(err => {
            console.error('[Webhook] Tick hatası:', err)
          })
        }
        break
      }

      case 'status-update':
        await handleStatusUpdate(message, supabase)
        break

      default:
        // Bilinmeyen event tipleri - sessizce geç
        break
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[Webhook] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function handleStatusUpdate(
  message: Record<string, unknown>,
  supabase: ReturnType<typeof createAdminClient>
) {
  const call = message.call as Record<string, unknown> | undefined
  const status = message.status as string

  if (!call?.id) return

  if (status === 'in-progress') {
    await supabase
      .from('campaign_items')
      .update({
        status: 'calling',
        call_started_at: new Date().toISOString(),
      })
      .eq('vapi_call_id', call.id)
  }
}
