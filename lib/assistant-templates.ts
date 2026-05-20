/**
 * Assistant Template Engine - Enterprise Edition
 *
 * İki katmanlı placeholder modeli:
 *   1. Wizard ({{UPPER_SNAKE}})  → kullanıcı asistanı yaratırken doldurur
 *   2. Runtime ({{camelCase}})   → her arama için Excel/customer_data'dan üretilir,
 *                                   VAPI'nin assistantOverrides.variableValues üzerinden çözülür
 *
 * Şablonların runtime değişkenleri `template.runtimeVariables[]` ile açıkça tanımlanır.
 * Excel parse buna göre yapılır; processor.ts buradan tek noktadan variableValues üretir.
 */

// ───────────────────── Type Definitions ─────────────────────

export interface TemplateField {
  id: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select'
  required?: boolean
  default?: string
  placeholder?: string
  help?: string
  options?: Array<{ value: string; label: string }>
}

/**
 * Şablonun her arama için Excel'den/customer_data'dan beklediği runtime değişken.
 * Bu, VAPI'ye `assistantOverrides.variableValues` olarak iletilir
 * ve {{key}} placeholder'ları çağrı sırasında VAPI tarafından çözülür.
 */
export interface RuntimeVariable {
  /** Prompt'ta {{key}} olarak kullanılır (camelCase). Örn: "appointmentTime" */
  key: string
  /** UI'da kullanıcıya gösterilecek başlık. Örn: "Randevu Saati" */
  label: string
  /** Kısa açıklama (örnek değer) */
  example?: string
  /** Excel sütun adı eşleşmeleri (Türkçe karakter normalize edilmiş). */
  excelColumns?: string[]
  /** Zorunlu mu? Boş gelirse `fallback` kullanılır. */
  required?: boolean
  /** Boş gelirse kullanılacak değer (örn: "değerli müşterimiz"). */
  fallback?: string
  /** Varsayılan olarak her zaman var olan değişken mi (customerName, customerPhone)? */
  builtin?: boolean
}

/**
 * Şablonun VAPI assistant config'i + variables manifest'i
 */
export interface TemplateConfig extends Record<string, unknown> {
  firstMessage?: string
  firstMessageMode?: string
  endCallMessage?: string
  voicemailMessage?: string
  backgroundSound?: string
  model?: {
    provider?: string
    model?: string
    temperature?: number
    maxTokens?: number
    messages?: Array<{ role: string; content: string }>
  }
  voice?: {
    provider?: string
    voiceId?: string
    model?: string
    speed?: number
    stability?: number
    similarityBoost?: number
  }
  transcriber?: {
    provider?: string
    model?: string
    language?: string
  }
  stopSpeakingPlan?: {
    numWords?: number
    voiceSeconds?: number
    backoffSeconds?: number
  }
  /** Runtime değişken manifest'i (per-call variableValues üretmek için) */
  runtimeVariables?: RuntimeVariable[]
}

export interface AssistantTemplate {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  category: string
  is_active: boolean
  is_featured: boolean
  display_order: number
  fields: TemplateField[]
  template: TemplateConfig
  usage_count: number
}

// ───────────────────── Built-in Runtime Variables ─────────────────────

/**
 * Her şablonda otomatik olarak bulunan default runtime değişkenler.
 * Şablonun kendi runtimeVariables'ı varsa, bunlar onunla birleştirilir.
 */
export const BUILTIN_RUNTIME_VARIABLES: RuntimeVariable[] = [
  {
    key: 'customerName',
    label: 'Müşteri Adı',
    example: 'Ahmet Yılmaz',
    excelColumns: [
      // Turkce - tum varyantlar
      'isim', 'ısim', 'ad', 'adi', 'adı', 'adsoyad', 'ad_soyad', 'adisoyadi', 'adı_soyadı',
      'isim_soyisim', 'isim soyisim', 'isimsoyisim', 'isimsoyad', 'isim_soyad',
      'musteri', 'müşteri', 'musteri_adi', 'musteri_ad', 'müşteri_adı', 'musteri_isim',
      'soyad', 'soyadi', 'soyadı', 'ad_ve_soyad', 'tam_isim', 'tam_ad', 'tamisim',
      'kisi', 'kişi', 'kisi_adi', 'kişi_adı', 'kullanici', 'kullanıcı',
      // English
      'name', 'fullname', 'full_name', 'firstname', 'first_name', 'lastname', 'last_name',
      'firstname_lastname', 'customer', 'customer_name', 'client', 'client_name',
      'user', 'username', 'person',
    ],
    required: true,
    fallback: 'değerli müşterimiz',
    builtin: true,
  },
  {
    key: 'customerPhone',
    label: 'Telefon',
    example: '+905551234567',
    excelColumns: [
      // Turkce
      'telefon', 'tel', 'telefon_no', 'telefon_numarasi', 'telefon_numarası',
      'numara', 'no', 'gsm', 'cep', 'cep_telefonu', 'cep_no', 'ceptelefonu',
      'iletisim', 'iletişim', 'arama_no',
      // English
      'phone', 'phone_number', 'phonenumber', 'mobile', 'mobile_number', 'cell',
      'cellphone', 'cell_phone', 'tel_no', 'msisdn', 'contact', 'contact_number',
      'whatsapp', 'wpp', 'number',
    ],
    required: true,
    builtin: true,
  },
  {
    key: 'customerGender',
    label: 'Cinsiyet (Hitap)',
    example: 'Bey / Hanım',
    excelColumns: ['cinsiyet', 'gender', 'cins', 'hitap', 'sex'],
    required: false,
    builtin: true,
  },
]

// Fuzzy match keyword'leri (sutun adi icinde GEÇEN kelimeler)
const NAME_KEYWORDS = ['isim', 'ad', 'soyad', 'name', 'musteri', 'customer', 'client', 'kisi', 'person']
const PHONE_KEYWORDS = ['telefon', 'phone', 'gsm', 'cep', 'mobile', 'tel', 'numara', 'number', 'msisdn', 'whatsapp']
const GENDER_KEYWORDS = ['cinsiyet', 'gender', 'hitap', 'sex']

// ───────────────────── Placeholder Engine ─────────────────────

/**
 * Bir string'deki {{KEY}} placeholder'larını values map'inden replace eder.
 * {{customerName}} gibi camelCase runtime placeholder'ları DEĞİŞTİRMEZ
 * (VAPI runtime'da assistantOverrides.variableValues ile çözer).
 */
function replacePlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g, (match, key) => {
    if (key in values) return values[key]
    return match
  })
}

/**
 * Recursive olarak template objesindeki tüm string'leri replace eder
 */
function deepReplace(obj: unknown, values: Record<string, string>): unknown {
  if (typeof obj === 'string') {
    return replacePlaceholders(obj, values)
  }
  if (Array.isArray(obj)) {
    return obj.map(item => deepReplace(item, values))
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = deepReplace(v, values)
    }
    return result
  }
  return obj
}

/**
 * Template'i kullanıcı değerleriyle doldurur ve VAPI-ready assistant config döner
 */
export function fillTemplate(
  template: AssistantTemplate,
  userValues: Record<string, string>
): Record<string, unknown> {
  const finalValues: Record<string, string> = {}
  for (const field of template.fields) {
    finalValues[field.id] = userValues[field.id] || field.default || ''
  }
  return deepReplace(template.template, finalValues) as Record<string, unknown>
}

/**
 * Template field validation - eksik required alanları döner
 */
export function validateTemplateValues(
  template: AssistantTemplate,
  userValues: Record<string, string>
): { valid: boolean; missing: string[] } {
  const missing: string[] = []
  for (const field of template.fields) {
    if (field.required && !userValues[field.id]?.trim() && !field.default) {
      missing.push(field.label)
    }
  }
  return { valid: missing.length === 0, missing }
}

// ───────────────────── Runtime Variables (per-call) ─────────────────────

/**
 * Şablonun tüm runtime değişkenlerini döndürür (built-in + custom).
 * Çakışan keyler için şablonun kendi tanımı önceliklidir.
 */
export function getEffectiveRuntimeVariables(template: AssistantTemplate): RuntimeVariable[] {
  const custom = template.template.runtimeVariables || []
  const customKeys = new Set(custom.map(v => v.key))
  const builtins = BUILTIN_RUNTIME_VARIABLES.filter(v => !customKeys.has(v.key))
  return [...builtins, ...custom]
}

/**
 * Türkçe karakter normalizasyonu + lowercase + trim + alfanümerik
 * Excel sütun başlığı eşleştirmesi için kullanılır.
 */
export function normalizeColumnName(str: string): string {
  return str
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'c')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Telefon numarasini akilli temizle.
 * - Scientific notation (9.05E+11) -> 905000000000 yaklasik (precision loss riski!)
 *   Bunu olabildiğince geri kurtarir; ancak gercek deger Excel'de saklanan
 *   ham sayidir. xlsx kutuphanesi raw mode'da bunu number olarak verir.
 * - +, -, boslukları temizler
 * - 11 hane ile basliyorsa 0 ekler (5xx -> 05xx)
 * - 10 hane ise basina 0 ekler
 */
function cleanPhoneNumber(raw: unknown): string {
  if (raw === null || raw === undefined) return ''

  let str = ''
  // Number ise direkt stringe cevir (E+11 sorunundan kacin)
  if (typeof raw === 'number') {
    if (!isFinite(raw) || isNaN(raw)) return ''
    // Integer ise toFixed(0), degilse precision'i koru
    str = Number.isInteger(raw) ? raw.toFixed(0) : raw.toString()
  } else {
    str = String(raw).trim()
  }

  // Scientific notation parse (string olarak gelmis ise)
  if (/^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(str)) {
    const n = Number(str)
    if (!isNaN(n) && isFinite(n)) {
      str = n.toFixed(0)
    }
  }

  // Sadece rakam ve + birak
  str = str.replace(/[^\d+]/g, '')

  // Cift + varsa temizle
  if (str.startsWith('++')) str = '+' + str.replace(/\+/g, '')

  // Bos kontrol
  if (!str || /^\++$/.test(str)) return ''

  return str
}

/**
 * Bir Excel satırından (raw object), şablonun runtimeVariables manifest'ine göre
 * customer_data jsonb için kullanılacak değer haritasını çıkarır.
 *
 * AKILLI ESLEŞTIRME:
 * 1. Exact match (normalize edilmis aliases ile)
 * 2. Substring match (sutun adi keyword icerirse - "ad soyad", "müşteri adı" vb.)
 * 3. Position fallback (sadece 1-2 sutun varsa: ilk=name, son=phone)
 *
 * @example
 * extractRuntimeValues({ 'ad soyad': 'Ahmet', 'tel': '5551234567' }, null)
 * // → { customerName: 'Ahmet', customerPhone: '5551234567' }
 */
export function extractRuntimeValues(
  row: Record<string, unknown>,
  template: AssistantTemplate | null
): Record<string, string> {
  const variables = template ? getEffectiveRuntimeVariables(template) : BUILTIN_RUNTIME_VARIABLES

  // Sutun adlarini normalize et + RAW degerleri sakla (telefon icin Number kalsin)
  const normalizedRow: Record<string, string> = {}
  const rawRow: Record<string, unknown> = {}
  const orderedKeys: string[] = []
  for (const [key, val] of Object.entries(row)) {
    if (val === null || val === undefined || val === '') continue
    const norm = normalizeColumnName(key)
    if (norm) {
      normalizedRow[norm] = String(val).trim()
      rawRow[norm] = val
      orderedKeys.push(norm)
    }
  }

  const result: Record<string, string> = {}
  const usedColumns = new Set<string>()

  for (const v of variables) {
    let matched: string | null = null

    // 1) EXACT alias match
    const aliases = (v.excelColumns || [v.key]).map(normalizeColumnName)
    aliases.unshift(normalizeColumnName(v.key))
    for (const alias of aliases) {
      if (normalizedRow[alias]) {
        matched = alias
        break
      }
    }

    // 2) SUBSTRING / FUZZY match (sutun adi keyword'lerden birini iceriyorsa)
    if (!matched) {
      const keywords =
        v.key === 'customerName' ? NAME_KEYWORDS :
        v.key === 'customerPhone' ? PHONE_KEYWORDS :
        v.key === 'customerGender' ? GENDER_KEYWORDS :
        []
      if (keywords.length > 0) {
        for (const colName of orderedKeys) {
          if (usedColumns.has(colName)) continue
          for (const kw of keywords) {
            if (colName.includes(kw)) {
              matched = colName
              break
            }
          }
          if (matched) break
        }
      }
    }

    if (matched) {
      usedColumns.add(matched)
      // Telefon ise raw degeri akilli temizle (E+11 sorununu cözer)
      if (v.key === 'customerPhone') {
        result[v.key] = cleanPhoneNumber(rawRow[matched])
      } else {
        result[v.key] = normalizedRow[matched]
      }
    }
  }

  // 3) POSITION FALLBACK: name ve phone hala bulunamadiysa, sadece 1-2 sutun varsa pozisyondan tahmin et
  if (!result.customerName && orderedKeys.length >= 1) {
    const firstUnused = orderedKeys.find(k => !usedColumns.has(k))
    if (firstUnused && normalizedRow[firstUnused]) {
      result.customerName = normalizedRow[firstUnused]
      usedColumns.add(firstUnused)
    }
  }
  if (!result.customerPhone && orderedKeys.length >= 2) {
    // Telefon icin: kalan sutunlardan rakam icereni sec
    for (const k of orderedKeys) {
      if (usedColumns.has(k)) continue
      const cleaned = cleanPhoneNumber(rawRow[k])
      if (cleaned && cleaned.replace(/\D/g, '').length >= 7) {
        result.customerPhone = cleaned
        usedColumns.add(k)
        break
      }
    }
  }

  return result
}

/**
 * Campaign item'ın customer_data'sından VAPI variableValues'i üretir.
 * Built-in keyleri otomatik ekler (customerName, customerPhone, customerGender).
 *
 * @param item Campaign item: { customer_name, customer_phone, customer_data }
 * @param template Şablon (manifest için). Yoksa sadece built-inler döner.
 */
export function buildVariableValues(
  item: {
    customer_name?: string | null
    customer_phone?: string | null
    customer_data?: Record<string, unknown> | null
  },
  template: AssistantTemplate | null
): Record<string, string> {
  const variables = template ? getEffectiveRuntimeVariables(template) : BUILTIN_RUNTIME_VARIABLES
  const data = item.customer_data || {}

  const values: Record<string, string> = {}
  for (const v of variables) {
    let val: string | undefined

    if (v.key === 'customerName') {
      val = item.customer_name || (data[v.key] as string) || v.fallback
    } else if (v.key === 'customerPhone') {
      val = item.customer_phone || (data[v.key] as string) || v.fallback
    } else {
      val = (data[v.key] as string) || (data[v.key.toLowerCase()] as string) || v.fallback
    }

    if (val !== undefined && val !== null && String(val).trim() !== '') {
      values[v.key] = String(val).trim()
    }
  }
  return values
}

// ───────────────────── DB Mapping ─────────────────────

/**
 * Template config'i Supabase assistant tablosundaki kolonlara map et
 */
export function templateToAssistantRecord(
  template: AssistantTemplate,
  userValues: Record<string, string>,
  customName?: string
): Record<string, unknown> {
  const filled = fillTemplate(template, userValues) as {
    firstMessage?: string
    firstMessageMode?: string
    endCallMessage?: string
    voicemailMessage?: string
    backgroundSound?: string
    model?: {
      provider?: string
      model?: string
      temperature?: number
      maxTokens?: number
      messages?: Array<{ role: string; content: string }>
    }
    voice?: {
      provider?: string
      voiceId?: string
      model?: string
      speed?: number
      stability?: number
      similarityBoost?: number
    }
    transcriber?: {
      provider?: string
      model?: string
      language?: string
    }
    stopSpeakingPlan?: {
      numWords?: number
      voiceSeconds?: number
      backoffSeconds?: number
    }
  }

  // Runtime variables manifest'ini şablon → asistan kaydına kopyala
  // (template silinse bile asistan çalışmaya devam etsin)
  const runtimeVars = getEffectiveRuntimeVariables(template)

  return {
    name: customName || userValues.ASSISTANT_NAME || template.name,
    first_message: filled.firstMessage,
    first_message_mode: filled.firstMessageMode === 'assistant-speaks-first' ? 'assistant' : 'user',
    end_call_message: filled.endCallMessage,
    voicemail_message: filled.voicemailMessage,
    background_sound: filled.backgroundSound || 'office',
    ai_provider: filled.model?.provider || 'openai',
    ai_model: filled.model?.model || 'gpt-4o-mini',
    temperature: filled.model?.temperature ?? 0.3,
    max_tokens: filled.model?.maxTokens ?? 2000,
    system_prompt: filled.model?.messages?.[0]?.content || '',
    elevenlabs_voice_id: filled.voice?.voiceId,
    elevenlabs_model: filled.voice?.model || 'eleven_turbo_v2_5',
    voice_speed: filled.voice?.speed ?? 1.0,
    voice_stability: filled.voice?.stability ?? 0.5,
    voice_similarity_boost: filled.voice?.similarityBoost ?? 0.75,
    stop_speaking_num_words: filled.stopSpeakingPlan?.numWords ?? 3,
    stop_speaking_voice_seconds: filled.stopSpeakingPlan?.voiceSeconds ?? 0.2,
    stop_speaking_backoff_seconds: filled.stopSpeakingPlan?.backoffSeconds ?? 0,
    end_call_tool_enabled: false,
    transcriber_provider: filled.transcriber?.provider || 'deepgram',
    transcriber_model: filled.transcriber?.model || 'nova-2',
    transcriber_language: filled.transcriber?.language || 'tr',
    template_slug: template.slug,
    runtime_variables: runtimeVars,
    // Default summary_prompt - sablon override etmediyse kullanilir
    summary_prompt: (template.template as { summaryPrompt?: string }).summaryPrompt ||
      'Sen profesyonel bir arama analisti asistansın. Verilen telefon görüşmesi transkriptini SADECE TÜRKÇE olarak özetle. 3-5 cümle: kimler konuştu, ne konuşuldu, sonuç ne oldu. Asla İngilizce kullanma. "Customer", "Agent" gibi terimler YOK; "Müşteri", "Asistan" kullan.',
  }
}
