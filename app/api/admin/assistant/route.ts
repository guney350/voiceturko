/**
 * Admin Assistant Management
 * Asistan eklendiğinde 10 atanmış key'in HEPSİNE eager provision edilir.
 * Silindiğinde VAPI'den de silinir.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { VapiPoolManager } from '@/lib/vapi/pool-manager'
import { VapiClient } from '@/lib/vapi/client'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === 'verified'
}

export async function POST(request: NextRequest) {
  try {
    if (!await verifyAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      userId, name, firstMessageMode, firstMessage, systemPrompt,
      aiProvider, aiModel, elevenlabsVoiceId, elevenlabsModel,
      temperature, maxTokens, voiceSpeed, voiceStability, voiceSimilarityBoost,
      endCallMessage, voicemailMessage, backgroundSound, endCallToolEnabled,
      stopSpeakingNumWords, stopSpeakingVoiceSeconds, stopSpeakingBackoffSeconds,
    } = body

    const supabase = getAdminSupabase()

    const { data, error } = await supabase
      .from('assistant')
      .insert({
        user_id: userId,
        name,
        first_message_mode: firstMessageMode,
        first_message: firstMessage,
        system_prompt: systemPrompt,
        ai_provider: aiProvider || 'openai',
        ai_model: aiModel,
        elevenlabs_voice_id: elevenlabsVoiceId,
        elevenlabs_model: elevenlabsModel,
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 3000,
        stop_speaking_num_words: stopSpeakingNumWords ?? 3,
        stop_speaking_voice_seconds: stopSpeakingVoiceSeconds ?? 0.2,
        stop_speaking_backoff_seconds: stopSpeakingBackoffSeconds ?? 0,
        voice_speed: voiceSpeed ?? 1.0,
        voice_stability: voiceStability ?? 0.5,
        voice_similarity_boost: voiceSimilarityBoost ?? 0.75,
        end_call_message: endCallMessage || null,
        voicemail_message: voicemailMessage || null,
        background_sound: backgroundSound || 'office',
        end_call_tool_enabled: endCallToolEnabled ?? true,
      })
      .select()
      .single()

    if (error) throw error

    let provisioning = null
    try {
      provisioning = await VapiPoolManager.syncAssistant(userId, data.id)
    } catch (syncErr) {
      console.error('VAPI sync error (create):', syncErr)
      const msg = syncErr instanceof Error ? syncErr.message : 'Sync failed'
      return NextResponse.json({
        success: true,
        data,
        warning: `Asistan DB'ye eklendi ancak VAPI'ye provision başarısız: ${msg}`,
      })
    }

    return NextResponse.json({ success: true, data, provisioning })
  } catch (error) {
    console.error('Assistant create error:', error)
    const msg = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!await verifyAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      id, name, firstMessageMode, firstMessage, systemPrompt,
      aiProvider, aiModel, elevenlabsVoiceId, elevenlabsModel,
      temperature, maxTokens, voiceSpeed, voiceStability, voiceSimilarityBoost,
      endCallMessage, voicemailMessage, backgroundSound, endCallToolEnabled,
      stopSpeakingNumWords, stopSpeakingVoiceSeconds, stopSpeakingBackoffSeconds,
    } = body

    const supabase = getAdminSupabase()

    const { data: existing } = await supabase
      .from('assistant')
      .select('user_id')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('assistant')
      .update({
        name,
        first_message_mode: firstMessageMode,
        first_message: firstMessage,
        system_prompt: systemPrompt,
        ai_provider: aiProvider || 'openai',
        ai_model: aiModel,
        elevenlabs_voice_id: elevenlabsVoiceId,
        elevenlabs_model: elevenlabsModel,
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 3000,
        voice_speed: voiceSpeed ?? 1.0,
        voice_stability: voiceStability ?? 0.5,
        voice_similarity_boost: voiceSimilarityBoost ?? 0.75,
        end_call_message: endCallMessage || null,
        voicemail_message: voicemailMessage || null,
        background_sound: backgroundSound || 'office',
        end_call_tool_enabled: endCallToolEnabled ?? true,
        stop_speaking_num_words: stopSpeakingNumWords ?? 3,
        stop_speaking_voice_seconds: stopSpeakingVoiceSeconds ?? 0.2,
        stop_speaking_backoff_seconds: stopSpeakingBackoffSeconds ?? 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (error) throw error

    if (existing?.user_id) {
      try {
        await VapiPoolManager.syncAssistant(existing.user_id, id)
      } catch (syncErr) {
        console.error('VAPI sync error (update):', syncErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Assistant update error:', error)
    const msg = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!await verifyAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const supabase = getAdminSupabase()

    // 1. Asistana bağlı tüm VAPI kaynaklarını bul (10 key'deki kopyalar)
    const { data: resources } = await supabase
      .from('vapi_resources')
      .select('id, vapi_account_id, vapi_resource_id, vapi_accounts(api_key)')
      .eq('local_resource_id', id)
      .eq('local_resource_type', 'assistant')
      .eq('resource_type', 'assistant')
      .eq('is_active', true)

    let vapiDeleted = 0
    let vapiFailed = 0

    if (resources && resources.length > 0) {
      for (const resource of resources) {
        try {
          const acc = Array.isArray(resource.vapi_accounts)
            ? resource.vapi_accounts[0]
            : resource.vapi_accounts
          if (!acc?.api_key) continue

          const client = new VapiClient(acc.api_key)
          await client.deleteAssistant(resource.vapi_resource_id)
          vapiDeleted++
        } catch (err) {
          console.error('VAPI assistant sil hatası:', err)
          vapiFailed++
        }
      }

      // vapi_resources'dan sil
      await supabase
        .from('vapi_resources')
        .delete()
        .eq('local_resource_id', id)
        .eq('local_resource_type', 'assistant')
    }

    // 2. assistant tablosundan sil
    const { error } = await supabase
      .from('assistant')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true, vapiDeleted, vapiFailed })
  } catch (error) {
    console.error('Assistant delete error:', error)
    const msg = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
