/**
 * Şablondan asistan oluştur
 * POST { templateId, values, customName? }
 *   → DB'ye assistant kaydı + VAPI'ye sync
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { templateToAssistantRecord, validateTemplateValues, type AssistantTemplate } from '@/lib/assistant-templates'
import { VapiPoolManager } from '@/lib/vapi/pool-manager'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { templateId, values, customName } = await request.json()

    if (!templateId || typeof values !== 'object') {
      return NextResponse.json({ error: 'templateId ve values zorunlu' }, { status: 400 })
    }

    const adminDb = createAdminClient()

    // Template'i çek
    const { data: template } = await adminDb
      .from('assistant_templates')
      .select('*')
      .eq('id', templateId)
      .eq('is_active', true)
      .single()

    if (!template) {
      return NextResponse.json({ error: 'Şablon bulunamadı' }, { status: 404 })
    }

    // Validation
    const { valid, missing } = validateTemplateValues(template as AssistantTemplate, values)
    if (!valid) {
      return NextResponse.json({
        error: `Zorunlu alanlar eksik: ${missing.join(', ')}`,
      }, { status: 400 })
    }

    // Template'i doldur ve assistant record oluştur
    const assistantData = templateToAssistantRecord(template as AssistantTemplate, values, customName)

    // DB'ye assistant kaydet — TRY her kolonu, schema uyumsuzluğunda fallback olarak yeniden dene
    let assistant: { id: string } | null = null
    let lastError: unknown = null

    // İlk deneme: tüm yeni alanlarla
    {
      const { data, error } = await adminDb
        .from('assistant')
        .insert({ user_id: user.id, ...assistantData })
        .select()
        .single()
      if (!error) {
        assistant = data
      } else {
        lastError = error
        console.warn('[template create] full insert failed, trying without optional columns:', error)
      }
    }

    // Fallback 1: runtime_variables ve template_slug olmayan eski schema için
    if (!assistant) {
      const { runtime_variables, template_slug, transcriber_provider, transcriber_model, transcriber_language, summary_prompt, ...fallbackData } = assistantData as Record<string, unknown>
      void runtime_variables; void template_slug; void transcriber_provider; void transcriber_model; void transcriber_language; void summary_prompt
      const { data, error } = await adminDb
        .from('assistant')
        .insert({ user_id: user.id, ...fallbackData })
        .select()
        .single()
      if (!error) {
        assistant = data
        console.warn('[template create] migration 008/017 uygulanmamış; eski schema ile kaydedildi.')
      } else {
        lastError = error
      }
    }

    if (!assistant) {
      const errObj = lastError as { message?: string; code?: string; hint?: string; details?: string } | null
      const detail = errObj?.message || errObj?.details || errObj?.hint || JSON.stringify(lastError)
      throw new Error(`Asistan kaydedilemedi: ${detail}${errObj?.code ? ` (kod: ${errObj.code})` : ''}`)
    }

    // Template usage counter artır (RPC yoksa atla)
    try {
      await adminDb.rpc('increment_template_usage', { p_template_id: templateId })
    } catch {
      // sessizce geç
    }

    // VAPI'ye sync et (10 key'e provision)
    let provisioning = null
    try {
      provisioning = await VapiPoolManager.syncAssistant(user.id, assistant.id)
    } catch (syncErr) {
      console.error('VAPI sync hatası (template asistan):', syncErr)
    }

    return NextResponse.json({
      success: true,
      assistant,
      provisioning,
      template: { id: template.id, name: template.name, slug: template.slug },
    })
  } catch (error: unknown) {
    const errObj = error as { message?: string; code?: string; details?: string; hint?: string }
    const msg = error instanceof Error
      ? error.message
      : errObj?.message || errObj?.details || errObj?.hint || JSON.stringify(error)
    console.error('[template create] error:', error)
    return NextResponse.json({
      error: msg,
      code: errObj?.code,
      hint: errObj?.hint,
    }, { status: 500 })
  }
}
