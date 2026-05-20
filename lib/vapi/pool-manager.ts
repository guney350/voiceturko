/**
 * VAPI Pool Manager (v2 - Stabilized)
 *
 * Yeni mantık:
 * - Her user'a kayıt anında 10 VAPI key tahsis edilir (DB trigger)
 * - SIP/Asistan eklendiğinde 10 key'in HEPSİNE eager olarak provision edilir
 * - Çağrı zamanı: 10 key arasından kapasitesi boş olanı seçilir
 * - Replication YOK, race condition YOK
 * - Atomic counter (RPC)
 *
 * PHP referans mimarisinden ilham alınmıştır:
 * - cached_phone_number_id + cached_assistants per key
 * - selectPoolAccount: ORDER BY active_calls ASC
 * - retryWithNextPoolAccount on errors
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { VapiClient, VapiCredentialRequest, VapiPhoneNumberRequest } from './client'
import { convertNumbersInText } from '@/lib/turkish-numbers'

// =====================================================
// TYPES
// =====================================================

interface PoolApiKey {
  id: string
  api_key: string
  email: string
  label: string | null
  status: string
  max_concurrent_calls: number
  current_active_calls: number
  is_current: boolean
  is_active: boolean
}

interface SipProvisionData {
  sipId: string
  name: string
  ipAddress: string
  port: number
  username: string
  password: string
  phoneNumber: string
}

interface AssistantProvisionData {
  assistantId: string
  name: string
  systemPrompt?: string
  firstMessage?: string
  firstMessageMode?: 'assistant-speaks-first' | 'assistant-waits-for-user' | string
  aiProvider?: string
  aiModel?: string
  elevenlabsVoiceId?: string
  elevenlabsModel?: string
}

interface ProvisionResult {
  successful: number
  failed: number
  total: number
  warnings: string[]
}

// =====================================================
// POOL MANAGER
// =====================================================

export class VapiPoolManager {

  // =====================================================
  // KEY ASSIGNMENT (10 KEY MODEL)
  // =====================================================
  
  /**
   * Kullanıcının atanmış 10 key'ini döner
   */
  static async getUserAssignedKeys(userId: string): Promise<PoolApiKey[]> {
    const supabase = createAdminClient()
    
    const { data } = await supabase
      .from('user_pool_assignments')
      .select(`
        vapi_account_id,
        vapi_accounts!inner(
          id, api_key, email, label, status,
          max_concurrent_calls, current_active_calls,
          is_current, is_active
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('vapi_accounts.is_active', true)

    if (!data || data.length === 0) return []

    return data.map(row => {
      const acc = Array.isArray(row.vapi_accounts) ? row.vapi_accounts[0] : row.vapi_accounts
      return acc as PoolApiKey
    }).filter(Boolean)
  }

  /**
   * Kullanıcıya yeni key tahsis et (admin manuel veya backfill için)
   * Eksik kalan slotları doldurur (max 10 olacak şekilde)
   */
  static async assignKeysToUser(userId: string, count: number = 10): Promise<number> {
    const supabase = createAdminClient()

    const existing = await this.getUserAssignedKeys(userId)
    const needed = Math.max(0, count - existing.length)
    if (needed === 0) return 0

    const existingIds = existing.map(k => k.id)

    const { data: availableKeys } = await supabase
        .from('vapi_accounts')
      .select('id')
        .eq('is_active', true)
      .in('status', ['active', 'standby'])
      .not('id', 'in', `(${existingIds.length > 0 ? existingIds.join(',') : '00000000-0000-0000-0000-000000000000'})`)
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })

    if (!availableKeys || availableKeys.length === 0) return 0

    // Henüz başka kullanıcıya atanmamış key'leri seç
    const { data: assigned } = await supabase
      .from('user_pool_assignments')
      .select('vapi_account_id')
      .eq('is_active', true)

    const assignedSet = new Set((assigned || []).map(a => a.vapi_account_id))
    const freeKeys = availableKeys.filter(k => !assignedSet.has(k.id)).slice(0, needed)

    if (freeKeys.length === 0) return 0

    const inserts = freeKeys.map(k => ({
      user_id: userId,
      vapi_account_id: k.id,
      is_active: true,
    }))

    const { error } = await supabase
      .from('user_pool_assignments')
      .insert(inserts)

    if (error) throw error
    return freeKeys.length
  }

  /**
   * Kullanıcının atanmış 10 key'i içinden kapasitesi boş olanı seç.
   * En az aktif arama olan key öncelikli.
   * Optional excludeIds: yakın zamanda CAPACITY_FULL alınmış key'ler dışında dene.
   */
  static async getAvailableKeyForUser(userId: string, excludeIds?: Set<string>): Promise<PoolApiKey> {
    const keys = await this.getUserAssignedKeys(userId)

    if (keys.length === 0) {
      throw new Error('NO_KEYS_ASSIGNED: Bu kullanıcıya henüz key tahsis edilmemiş. Admin destek ile iletişime geçin.')
    }

    // active/standby olanları filtrele
    let usable = keys.filter(k =>
      ['active', 'standby'].includes(k.status) && k.is_active
    )

    if (excludeIds && excludeIds.size > 0) {
      usable = usable.filter(k => !excludeIds.has(k.id))
    }

    if (usable.length === 0) {
      throw new Error('NO_ACTIVE_KEYS: Tahsisli keylerin hiçbiri aktif değil. Admin destek ile iletişime geçin.')
    }

    // En az aktif arama olana göre sırala
    usable.sort((a, b) => (a.current_active_calls || 0) - (b.current_active_calls || 0))

    for (const key of usable) {
      if ((key.current_active_calls || 0) < (key.max_concurrent_calls || 10)) {
        return key
      }
    }

    throw new Error('POOL_CAPACITY_FULL: Tüm 10 hattınız dolu. Lütfen biraz bekleyin.')
  }

  // =====================================================
  // EAGER PROVISIONING (10 KEY'E PARALEL)
  // =====================================================

  /**
   * SIP trunk'u kullanıcının 10 atanmış key'ine de provision eder.
   * Her key için ayrı VAPI credential + phone number oluşturur.
   */
  static async provisionSipTrunk(userId: string, data: SipProvisionData): Promise<ProvisionResult> {
    const supabase = createAdminClient()
    const keys = await this.getUserAssignedKeys(userId)

    if (keys.length === 0) {
      throw new Error('NO_KEYS_ASSIGNED: Önce key tahsisi yapılmalı')
    }

    const warnings: string[] = []
    const results = await Promise.allSettled(
      keys.map(key => this._provisionSipOnSingleKey(userId, key, data))
    )

    let successful = 0
    let firstSuccessfulCredId: string | null = null
    let firstSuccessfulPhoneId: string | null = null
    let firstSuccessfulKeyId: string | null = null

    results.forEach((r, i) => {
      const keyId = keys[i].id.substring(0, 8)
      if (r.status === 'fulfilled') {
        successful++
        if (!firstSuccessfulCredId) {
          firstSuccessfulCredId = r.value.credentialId
          firstSuccessfulPhoneId = r.value.phoneNumberId
          firstSuccessfulKeyId = r.value.vapiAccountId
        }
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        warnings.push(`Key ${keyId}: ${msg}`)
        console.error(`[PoolManager] SIP provision hatası (key ${keyId}):`, r.reason)
      }
    })

    if (successful === 0) {
      throw new Error('PROVISION_FAILED: Hiçbir key\'e SIP provision edilemedi. ' + warnings.join('; '))
    }

    // sips tablosunu ilk başarılı kayıtla güncelle (özet/referans için)
    if (firstSuccessfulCredId && firstSuccessfulPhoneId && firstSuccessfulKeyId) {
      await supabase
        .from('sips')
        .update({
          vapi_credential_id: firstSuccessfulCredId,
          vapi_phone_number_id: firstSuccessfulPhoneId,
          vapi_account_id: firstSuccessfulKeyId,
          vapi_synced_at: new Date().toISOString(),
          phone_number: data.phoneNumber,
        })
        .eq('id', data.sipId)
    }

    return {
      successful,
      failed: keys.length - successful,
      total: keys.length,
      warnings,
    }
  }

  /**
   * SIP'i tek bir key'e provision eder
   */
  private static async _provisionSipOnSingleKey(
    userId: string,
    key: PoolApiKey,
    data: SipProvisionData
  ): Promise<{ credentialId: string; phoneNumberId: string; vapiAccountId: string }> {
    const supabase = createAdminClient()
    const client = new VapiClient(key.api_key)

    // İdempotency: Bu key'de zaten var mı?
    const { data: existing } = await supabase
      .from('vapi_resources')
      .select('vapi_resource_id, resource_type')
      .eq('user_id', userId)
      .eq('vapi_account_id', key.id)
      .eq('local_resource_id', data.sipId)
      .eq('local_resource_type', 'sip')
      .eq('is_active', true)

    if (existing && existing.length > 0) {
      const cred = existing.find(r => r.resource_type === 'credential')
      const phone = existing.find(r => r.resource_type === 'phone_number')
      if (cred && phone) {
        return {
          credentialId: cred.vapi_resource_id,
          phoneNumberId: phone.vapi_resource_id,
          vapiAccountId: key.id,
        }
      }
    }

    // 1. SIP credential
    const credentialPayload: VapiCredentialRequest = {
      provider: 'byo-sip-trunk',
      name: `${data.name} - User ${userId.substring(0, 8)}`,
      gateways: [{
        ip: data.ipAddress,
        port: data.port,
        inboundEnabled: true,
      }],
      outboundLeadingPlusEnabled: true,
      outboundAuthenticationPlan: {
        authUsername: data.username,
        authPassword: data.password,
      },
    }
    
    const credential = await client.createCredential(credentialPayload)
    
    // 2. Phone number
    let phoneNumber
    try {
      phoneNumber = await client.createPhoneNumber({
      provider: 'byo-phone-number',
      number: data.phoneNumber,
      numberE164CheckEnabled: true,
      credentialId: credential.id,
      name: data.name,
      })
    } catch (phoneErr) {
      try { await client.deleteCredential(credential.id) } catch {}
      throw phoneErr
    }
    
    // 3. DB kayıtları
    await supabase.from('vapi_resources').insert([
      {
      user_id: userId,
        vapi_account_id: key.id,
      resource_type: 'credential',
      vapi_resource_id: credential.id,
      local_resource_id: data.sipId,
      local_resource_type: 'sip',
      metadata: { name: data.name, ip: data.ipAddress, port: data.port },
      },
      {
      user_id: userId,
        vapi_account_id: key.id,
      resource_type: 'phone_number',
      vapi_resource_id: phoneNumber.id,
      local_resource_id: data.sipId,
      local_resource_type: 'sip',
      metadata: { number: data.phoneNumber, credential_id: credential.id },
      },
    ])
    
    return {
      credentialId: credential.id,
      phoneNumberId: phoneNumber.id,
      vapiAccountId: key.id,
    }
  }

  /**
   * Bir key üzerinde endCall tool'u oluştur veya mevcudu döner
   */
  static async ensureEndCallTool(
    userId: string,
    vapiAccountId: string,
    client: VapiClient
  ): Promise<string | null> {
    const supabase = createAdminClient()

    const { data: existingTool } = await supabase
      .from('vapi_resources')
      .select('vapi_resource_id')
      .eq('user_id', userId)
      .eq('vapi_account_id', vapiAccountId)
      .eq('resource_type', 'tool')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (existingTool) return existingTool.vapi_resource_id

    try {
      const tool = await client.createTool({
        type: 'endCall',
        async: false,
        function: {
          name: 'endCall',
          description: 'SADECE konuşma tamamen bittiğinde, müşteri vedalaştığında, müşteri kapatmak istediğini söylediğinde veya tüm anket/konu sonuçlandığında kullanılır. ASLA selamlaşma anında veya konuşma yeni başladığında çağırma. Müşterinin tüm sorulara cevap verdiğinden emin ol.',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        messages: [
          {
            type: 'request-start',
            content: 'Sağlıklı günler dilerim.',
          },
        ],
      })

      await supabase.from('vapi_resources').insert({
        user_id: userId,
        vapi_account_id: vapiAccountId,
        resource_type: 'tool',
        vapi_resource_id: tool.id,
        local_resource_id: 'endcall',
        local_resource_type: 'tool',
        metadata: { type: 'endCall', name: 'end_call_tool' },
      })

      return tool.id
    } catch (err) {
      console.error('[PoolManager] EndCall tool oluşturulamadı:', err)
      return null
    }
  }

  /**
   * Asistanı kullanıcının 10 atanmış key'ine de provision eder.
   */
  static async provisionAssistant(userId: string, data: AssistantProvisionData): Promise<ProvisionResult> {
    const supabase = createAdminClient()
    const keys = await this.getUserAssignedKeys(userId)

    if (keys.length === 0) {
      throw new Error('NO_KEYS_ASSIGNED: Önce key tahsisi yapılmalı')
    }

    // Asistan tam verisini çek
    const { data: fullAssistant } = await supabase
      .from('assistant')
      .select('*')
      .eq('id', data.assistantId)
      .single()

    const warnings: string[] = []
    const results = await Promise.allSettled(
      keys.map(key => this._provisionAssistantOnSingleKey(userId, key, data, fullAssistant))
    )

    let successful = 0
    let firstSuccessfulVapiAssistantId: string | null = null

    results.forEach((r, i) => {
      const keyId = keys[i].id.substring(0, 8)
      if (r.status === 'fulfilled') {
        successful++
        if (!firstSuccessfulVapiAssistantId) {
          firstSuccessfulVapiAssistantId = r.value.vapiAssistantId
        }
      } else {
        const msg = r.reason instanceof Error ? r.reason.message : String(r.reason)
        warnings.push(`Key ${keyId}: ${msg}`)
        console.error(`[PoolManager] Asistan provision hatası (key ${keyId}):`, r.reason)
      }
    })

    if (successful === 0) {
      throw new Error('PROVISION_FAILED: Hiçbir key\'e asistan provision edilemedi. ' + warnings.join('; '))
    }

    // assistant tablosunu ilk başarılı VAPI ID ile güncelle (referans için)
    if (firstSuccessfulVapiAssistantId) {
    await supabase
      .from('assistant')
      .update({
          vapi_assistant_id: firstSuccessfulVapiAssistantId,
        vapi_synced_at: new Date().toISOString(),
      })
      .eq('id', data.assistantId)
    }
    
    return {
      successful,
      failed: keys.length - successful,
      total: keys.length,
      warnings,
    }
  }

  private static async _provisionAssistantOnSingleKey(
    userId: string,
    key: PoolApiKey,
    data: AssistantProvisionData,
    fullAssistant: Record<string, unknown> | null
  ): Promise<{ vapiAssistantId: string; vapiAccountId: string }> {
    const supabase = createAdminClient()
    const client = new VapiClient(key.api_key)

    // İdempotency: Bu key'de zaten var mı?
    const { data: existing } = await supabase
      .from('vapi_resources')
      .select('vapi_resource_id')
      .eq('user_id', userId)
      .eq('vapi_account_id', key.id)
      .eq('local_resource_id', data.assistantId)
      .eq('resource_type', 'assistant')
      .eq('is_active', true)
      .maybeSingle()

    if (existing) {
      // Update et (eğer ayar değiştiyse)
      const payload = await this._buildAssistantPayload(userId, key.id, data, fullAssistant, client)
      try {
        await client.updateAssistant(existing.vapi_resource_id, payload)
      } catch (err) {
        console.error(`[PoolManager] Asistan update hatası:`, err)
      }
      return { vapiAssistantId: existing.vapi_resource_id, vapiAccountId: key.id }
    }

    // 1. Tool oluştur (her zaman, end_call_tool_enabled !== false ise)
    let toolId: string | null = null
    if (fullAssistant?.end_call_tool_enabled !== false) {
      toolId = await this.ensureEndCallTool(userId, key.id, client)
    }

    // 2. Asistan payload'u
    const payload = await this._buildAssistantPayload(userId, key.id, data, fullAssistant, client, toolId)

    const vapiAssistant = await client.createAssistant(payload)

    // 3. DB kaydı
    await supabase.from('vapi_resources').insert({
      user_id: userId,
      vapi_account_id: key.id,
      resource_type: 'assistant',
      vapi_resource_id: vapiAssistant.id,
      local_resource_id: data.assistantId,
      local_resource_type: 'assistant',
      metadata: { name: data.name },
    })

    return { vapiAssistantId: vapiAssistant.id, vapiAccountId: key.id }
  }

  /**
   * Asistan payload'u oluştur (VAPI formatında)
   * Tool ID HER ZAMAN model.toolIds'e eklenir (eğer varsa)
   */
  private static async _buildAssistantPayload(
    userId: string,
    vapiAccountId: string,
    data: AssistantProvisionData,
    fullAssistant: Record<string, unknown> | null,
    client: VapiClient,
    preComputedToolId?: string | null
  ): Promise<Record<string, unknown>> {
    const fa = fullAssistant || {}

    // Tool ID al (yoksa oluştur)
    let toolId = preComputedToolId
    if (toolId === undefined && fa.end_call_tool_enabled !== false) {
      toolId = await this.ensureEndCallTool(userId, vapiAccountId, client)
    }

    const fmm = data.firstMessageMode || fa.first_message_mode
    const firstMessageMode =
      fmm === 'assistant' ? 'assistant-speaks-first' :
      fmm === 'user' ? 'assistant-waits-for-user' :
      (fmm as string) || 'assistant-speaks-first'

    const payload: Record<string, unknown> = {
      name: data.name,
      firstMessageMode,
    }

    // Rakamlari Turkce yaziya cevir (TTS daha dogal okusun)
    if (data.firstMessage || fa.first_message) {
      payload.firstMessage = convertNumbersInText((data.firstMessage || fa.first_message) as string)
    }

    if (fa.end_call_message) payload.endCallMessage = convertNumbersInText(fa.end_call_message as string)
    if (fa.voicemail_message) payload.voicemailMessage = convertNumbersInText(fa.voicemail_message as string)
    if (fa.background_sound) payload.backgroundSound = fa.background_sound

    // System prompt - rakamlari yaziya cevir
    const systemPromptRaw = (data.systemPrompt || fa.system_prompt) as string | undefined
    const systemPromptText = systemPromptRaw ? convertNumbersInText(systemPromptRaw) : null

    // Model payload (toolIds her zaman eklenir, eğer toolId varsa)
    const modelPayload: Record<string, unknown> = {
      provider: data.aiProvider || fa.ai_provider || 'openai',
      model: data.aiModel || fa.ai_model || 'gpt-4o',
      temperature: (fa.temperature as number) ?? 0.7,
      maxTokens: (fa.max_tokens as number) ?? 3000,
      messages: systemPromptText ? [{
              role: 'system',
        content: systemPromptText,
            }] : [],
          }

    if (toolId) {
      modelPayload.toolIds = [toolId]
    }

    payload.model = modelPayload

    // Ses
    const voiceId = data.elevenlabsVoiceId || fa.elevenlabs_voice_id
    if (voiceId) {
          payload.voice = {
            provider: '11labs',
        voiceId,
        model: data.elevenlabsModel || fa.elevenlabs_model || 'eleven_turbo_v2_5',
        speed: (fa.voice_speed as number) ?? 1.0,
        stability: (fa.voice_stability as number) ?? 0.5,
        similarityBoost: (fa.voice_similarity_boost as number) ?? 0.75,
      }
    }

    // Stop speaking
        payload.stopSpeakingPlan = {
      numWords: (fa.stop_speaking_num_words as number) ?? 3,
      voiceSeconds: (fa.stop_speaking_voice_seconds as number) ?? 0.2,
      backoffSeconds: (fa.stop_speaking_backoff_seconds as number) ?? 0,
    }

    // Transcriber
        payload.transcriber = {
          provider: 'deepgram',
          model: 'nova-2',
      language: 'tr',
    }

    // Analysis Plan - Asistanin summary_prompt'u (varsa) veya default Turkce ozet
    const DEFAULT_SUMMARY_PROMPT = 'Sen profesyonel bir arama analisti asistans\u0131n. Verilen telefon g\u00F6r\u00FC\u015Fmesi transkriptini SADECE T\u00FCRK\u00E7E olarak \u00F6zetle. 3-5 c\u00FCmle: kimler konu\u015Ftu, ne konu\u015Fuldu, sonu\u00E7 ne oldu. Asla \u0130ngilizce kullanma. "Customer", "Agent" gibi terimler YOK; "M\u00FC\u015Fteri", "Asistan" kullan.'
    const summaryPrompt = (fa.summary_prompt as string) || DEFAULT_SUMMARY_PROMPT

    payload.analysisPlan = {
      summaryPlan: {
        enabled: true,
        messages: [{
          role: 'system',
          content: summaryPrompt
        }]
      },
      successEvaluationPlan: {
        enabled: true,
        rubric: 'AutomaticRubric',
        messages: [{
          role: 'system',
          content: 'Bu araman\u0131n ba\u015Far\u0131l\u0131 olup olmad\u0131\u011F\u0131n\u0131 de\u011Ferlendir. Ba\u015Far\u0131l\u0131 = m\u00FC\u015Fteri ilgilendi veya bilgi ald\u0131. Ba\u015Far\u0131s\u0131z = m\u00FC\u015Fteri reddetti veya ula\u015F\u0131lamad\u0131. T\u00FCRK\u00E7E olarak k\u0131sa de\u011Ferlendirme yaz.'
        }]
      }
    }

    // SERVER URL: Webhook icin (production'da gerekli)
    // Localhost ise gonderme (VAPI localhost'a webhook ulastiramaz, anlamsiz)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    if (appUrl && !appUrl.includes('localhost') && !appUrl.includes('127.0.0.1')) {
      payload.server = {
        url: `${appUrl.replace(/\/$/, '')}/api/webhooks/vapi`,
        timeoutSeconds: 20,
      }
      if (process.env.VAPI_WEBHOOK_SECRET) {
        (payload.server as Record<string, unknown>).secret = process.env.VAPI_WEBHOOK_SECRET
      }
    }

    // Server Messages: hangi event'ler webhook'a gonderilsin
    payload.serverMessages = [
      'end-of-call-report',
      'status-update',
      'hang',
    ]

    return payload
  }

  /**
   * Asistanı sync et (DB'den VAPI'ye). Tüm 10 key'de günceller.
   * IDOR koruma: assistant userId'ye aitse devam, degilse 403
   */
  static async syncAssistant(userId: string, localAssistantId: string): Promise<ProvisionResult> {
    const supabase = createAdminClient()
    const { data: assistant } = await supabase
      .from('assistant')
      .select('*')
      .eq('id', localAssistantId)
      .eq('user_id', userId) // OWNERSHIP CHECK
      .single()

    if (!assistant) {
      throw new Error('ASSISTANT_NOT_FOUND_OR_FORBIDDEN')
    }

    return this.provisionAssistant(userId, {
      assistantId: localAssistantId,
      name: assistant.name,
      firstMessageMode: assistant.first_message_mode,
      firstMessage: assistant.first_message,
      systemPrompt: assistant.system_prompt,
      aiProvider: assistant.ai_provider,
      aiModel: assistant.ai_model,
      elevenlabsVoiceId: assistant.elevenlabs_voice_id,
      elevenlabsModel: assistant.elevenlabs_model,
    })
  }

  // =====================================================
  // CALL RESOURCES (ÇAĞRI ZAMANI)
  // =====================================================

  /**
   * Arama için kullanılacak API key + VAPI assistant ID + phone number ID döner.
   * Kullanıcının 10 key'i arasından kapasitesi boş olanı seçer.
   * Eksik kaynak varsa o key'e self-heal yapar.
   */
  static async getCallResources(
    userId: string,
    localAssistantId: string,
    _retryCount = 0,
    options?: { sipId?: string | null; excludeKeyIds?: Set<string> }
  ): Promise<{
    apiKey: string
    vapiAccountId: string
    vapiAssistantId: string
    vapiPhoneNumberId: string
  }> {
    const supabase = createAdminClient()
    const key = await this.getAvailableKeyForUser(userId, options?.excludeKeyIds)
    
    // Bu key üzerindeki asistan ve phone number'ı al
    const { data: assistantRes } = await supabase
      .from('vapi_resources')
      .select('vapi_resource_id')
      .eq('user_id', userId)
      .eq('vapi_account_id', key.id)
      .eq('local_resource_id', localAssistantId)
      .eq('resource_type', 'assistant')
      .eq('is_active', true)
      .maybeSingle()
    
    // SIP filtresi: kampanyada belirlenmiş bir sip_id varsa o sip'in numarasını kullan
    const phoneQuery = supabase
      .from('vapi_resources')
      .select('vapi_resource_id, local_resource_id')
      .eq('user_id', userId)
      .eq('vapi_account_id', key.id)
      .eq('resource_type', 'phone_number')
      .eq('is_active', true)

    if (options?.sipId) {
      phoneQuery.eq('local_resource_id', options.sipId)
    }

    const { data: phoneRes } = await phoneQuery.limit(1).maybeSingle()

    // Eksikse self-heal
    if (!assistantRes || !phoneRes) {
      if (_retryCount >= 1) {
        throw new Error(
          `RESOURCES_NOT_FOUND: Bu key'de gerekli kaynaklar bulunamadı (assistant=${!!assistantRes}, phone=${!!phoneRes}). ` +
          `Lütfen SIP ve Asistan ayarlarınızı kontrol edin.`
        )
      }

      console.log(`[PoolManager] Self-heal: Key ${key.id.substring(0, 8)} için eksik kaynaklar provision ediliyor...`)

      if (!assistantRes) {
        await this.syncAssistant(userId, localAssistantId)
      }

      if (!phoneRes) {
        const { data: sips } = await supabase
          .from('sips')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)

      if (sips && sips.length > 0) {
          await this.provisionSipTrunk(userId, {
          sipId: sips[0].id,
          name: sips[0].name,
          ipAddress: sips[0].ip_address,
          port: sips[0].port,
          username: sips[0].username,
          password: sips[0].password,
            phoneNumber: sips[0].phone_number || `+90${sips[0].username}`,
          })
        } else {
          throw new Error('NO_SIP_CONFIGURED: Önce SIP ayarlarınızı yapın')
        }
      }

      return this.getCallResources(userId, localAssistantId, _retryCount + 1, options)
        }
        
        return {
      apiKey: key.api_key,
      vapiAccountId: key.id,
      vapiAssistantId: assistantRes.vapi_resource_id,
      vapiPhoneNumberId: phoneRes.vapi_resource_id,
    }
  }

  // =====================================================
  // ATOMIC COUNTERS (RPC)
  // =====================================================

  /**
   * Atomic olarak active call sayısını artır + kapasite kontrolü
   * Returns: { success, current_active_calls } veya { success: false, reason }
   */
  static async incrementActiveCall(vapiAccountId: string): Promise<{ success: boolean; currentActiveCalls?: number; reason?: string }> {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('increment_active_calls', { account_id: vapiAccountId })
    if (error) {
      return { success: false, reason: error.message }
    }
    const result = data as { success: boolean; current_active_calls?: number; reason?: string }
    return {
      success: result.success,
      currentActiveCalls: result.current_active_calls,
      reason: result.reason,
    }
  }

  /**
   * Atomic olarak active call sayısını azalt
   */
  static async decrementActiveCall(vapiAccountId: string): Promise<void> {
    const supabase = createAdminClient()
    await supabase.rpc('decrement_active_calls', { account_id: vapiAccountId })
  }

  // =====================================================
  // ADMIN METHODS
  // =====================================================

  /**
   * Pool istatistikleri (admin)
   */
  static async getPoolStats(): Promise<{
    totalKeys: number
    activeKeys: number
    totalCapacity: number
    usedCapacity: number
    availableCapacity: number
    totalUsers: number
    keys: PoolApiKey[]
  }> {
    const supabase = createAdminClient()
    
    const { data: keys } = await supabase
      .from('vapi_accounts')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true })

    const { count: totalUsers } = await supabase
      .from('user_pool_assignments')
      .select('user_id', { count: 'exact', head: true })
    
    const allKeys = (keys || []) as PoolApiKey[]
    const activeKeys = allKeys.filter(k => ['active', 'standby'].includes(k.status))
    
    return {
      totalKeys: allKeys.length,
      activeKeys: activeKeys.length,
      totalCapacity: activeKeys.reduce((s, k) => s + (k.max_concurrent_calls || 10), 0),
      usedCapacity: activeKeys.reduce((s, k) => s + (k.current_active_calls || 0), 0),
      availableCapacity: activeKeys.reduce((s, k) => s + ((k.max_concurrent_calls || 10) - (k.current_active_calls || 0)), 0),
      totalUsers: totalUsers || 0,
      keys: allKeys,
    }
  }
}
