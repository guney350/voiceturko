/**
 * Chatbot Sistem Context'i
 *
 * AI asistanın platform hakkında bilgi sahibi olması için sistem prompt'a enjekte edilen bilgiler.
 * Bu bilgi kullanıcının sayfası, bakiyesi vs. dinamik olarak güncellenir.
 */

import { createAdminClient } from '@/lib/supabase/admin'

interface UserContext {
  email: string
  userId: string
  balance: {
    credit_try: number
    package_minutes_remaining: number
    package_rate_per_minute: number
  } | null
  assignedKeys: number
  sips: number
  assistants: number
  campaigns: number
}

const SYSTEM_OVERVIEW = `
# VoiceTurko - AI Çağrı Platformu

VoiceTurko, işletmelerin AI sesli asistanlarla otomatik telefon görüşmeleri yapabildiği bir SaaS platformudur.

## Temel Özellikler

### 1. AI Asistanlar
- ElevenLabs voice + OpenAI/Claude/Groq dil modelleri ile
- Türkçe konuşan, doğal sesli asistanlar
- Özelleştirilebilir kişilik, ilk mesaj, sistem prompt'u
- "Asistanlar" sayfasından oluşturulur

### 2. SIP Yönetimi
- Kullanıcı kendi SIP sağlayıcısını ekler (örn: Karel, NetGSM)
- Bilgiler: IP adresi, port (genelde 5060), kullanıcı adı, şifre, E.164 telefon (+90...)
- "SIP Yönetimi" sayfasından eklenir

### 3. Kampanyalar
- Excel/CSV ile müşteri listesi yükleyip toplu arama
- Eşzamanlı arama sayısı ayarlanabilir (1-100)
- Otomatik retry, transcript ve AI analiz raporu

### 4. Paketler ve Bakiye
**Paketler:**
- **Başlangıç**: 10₺/dakika - kullandıkça öde (sözleşme yok)
- **Ekonomik**: 10.000 dakika @ 7₺/dk = 70.000₺
- **Popüler**: 30.000 dakika @ 5₺/dk = 150.000₺
- **Profesyonel**: 50.000 dakika @ 4₺/dk = 200.000₺
- **Kurumsal**: 100.000 dakika @ 3₺/dk = 300.000₺

Paket bitince 10₺/dakika kredi ile devam eder.

### 5. Ödeme Yöntemleri
- Kredi kartı (Stripe)
- Crypto (Oxapay - BTC, ETH, USDT vs.)

### 6. Otomatik İşler
- Her kullanıcıya 10 API hattı tahsis edilir
- Hat dolunca otomatik yeni hat tahsis edilir
- Çağrılar arka planda işlenir, real-time güncellenmez

## Önemli Sayfalar
- /dashboard - Genel bakış, kapasite, bakiye
- /dashboard/packages - Paket satın al
- /dashboard/credits - Kredi yükle, işlem geçmişi
- /dashboard/assistant - AI asistan yönet
- /dashboard/sip - SIP trunk yönet
- /dashboard/campaigns - Kampanyalar
- /dashboard/calls - Arama geçmişi
- /dashboard/settings - Profil ayarları

## Sık Sorulan Sorular

**Q: Nasıl başlarım?**
A: 1) SIP ayarlarını ekle, 2) AI asistan oluştur, 3) Excel'i yükleyerek kampanya başlat

**Q: Kredi yetmezse?**
A: Arama yapılmaz, kredi yükleyip devam edebilirsiniz.

**Q: Paket dakikası bittiyse?**
A: Otomatik 10₺/dk kredi sistemine geçer.

**Q: Aynı anda kaç arama yapabilirim?**
A: Her kullanıcıya 10 hat, her hat 10 eşzamanlı = 100 eşzamanlı arama.

**Q: Aramalar nereye kaydediliyor?**
A: Tüm aramalar transkript+ses kaydı ile /dashboard/calls'da görüntülenebilir.
`.trim()

export async function buildSystemPrompt(
  userId: string | null,
  currentPage: string | null,
  basePersonality: string
): Promise<string> {
  let userContext = ''

  if (userId) {
    const ctx = await getUserContext(userId)
    if (ctx) {
      userContext = `
## Kullanıcı Bilgileri (gerçek zamanlı)
- Email: ${ctx.email}
- Kredi bakiye: ${ctx.balance?.credit_try.toFixed(2) || '0.00'}₺
- Paket dakika: ${ctx.balance?.package_minutes_remaining || 0} dakika
- Dakika fiyatı: ${ctx.balance?.package_rate_per_minute || 10}₺/dk
- Tahsisli hat: ${ctx.assignedKeys}/10
- Eklenmiş SIP: ${ctx.sips}
- Eklenmiş Asistan: ${ctx.assistants}
- Toplam kampanya: ${ctx.campaigns}
      `.trim()
    }
  }

  const pageContext = currentPage
    ? `\n## Şu an bulunduğu sayfa\n${currentPage}\n(Kullanıcı bu sayfadan soruyor - cevabını bu bağlama göre ver)`
    : ''

  return `${basePersonality}

${SYSTEM_OVERVIEW}

${userContext}
${pageContext}

## Genel Kurallar
1. Türkçe cevap ver, profesyonel ama samimi ol
2. Kısa ve net ol - uzun açıklamalar yapma
3. Adım adım rehberlik yap, markdown kullan (### başlık, - liste, **kalın**)
4. Bilmediğin bir şey varsa "Bu konuda kesin bilgim yok, canlı destek ekibine bağlanmanızı öneririm" de
5. Canlı destek talebi için kullanıcı "destek", "insan", "yardım gerek" gibi şeyler yazarsa "Canlı Destek" butonunu kullanmasını öner
6. Kullanıcı bakiyesi hakkında soru sorarsa, yukarıdaki "Kullanıcı Bilgileri"ne bak
7. Para/fiyat konularda kesin bilgi ver
8. Asla teknik VAPI jargonu kullanma (assistant, credential, tool) - "AI asistan", "SIP bağlantısı" gibi anlaşılır terimler kullan
9. Eğer sayfa context'i varsa, o sayfaya özel yardım ver (örn: /dashboard/sip'teyse SIP ekleme adımlarını anlat)
`.trim()
}

async function getUserContext(userId: string): Promise<UserContext | null> {
  try {
    const sb = createAdminClient()

    const [authResult, balanceResult, keysResult, sipsResult, asstResult, campResult] = await Promise.all([
      sb.auth.admin.getUserById(userId),
      sb.from('user_balances').select('*').eq('user_id', userId).maybeSingle(),
      sb.from('user_pool_assignments').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
      sb.from('sips').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
      sb.from('assistant').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      sb.from('campaigns').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ])

    return {
      email: authResult.data?.user?.email || 'unknown',
      userId,
      balance: balanceResult.data
        ? {
            credit_try: parseFloat(balanceResult.data.credit_try) || 0,
            package_minutes_remaining: balanceResult.data.package_minutes_remaining || 0,
            package_rate_per_minute: parseFloat(balanceResult.data.package_rate_per_minute) || 10,
          }
        : null,
      assignedKeys: keysResult.count || 0,
      sips: sipsResult.count || 0,
      assistants: asstResult.count || 0,
      campaigns: campResult.count || 0,
    }
  } catch (err) {
    console.error('[chatbot context] error:', err)
    return null
  }
}
