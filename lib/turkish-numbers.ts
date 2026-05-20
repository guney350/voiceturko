/**
 * Turkish Number Words Converter
 *
 * Asistan prompt'larındaki rakamları Türkçe yazılı forma dönüştürür.
 * VAPI'nin TTS motoru rakamları yanlış okuyabiliyor; yazılı form daha doğal.
 *
 * Örnek:
 *   "3 gündüz 2 gece"     → "üç gündüz iki gece"
 *   "14:30 randevu"        → "saat on dört otuz randevu"
 *   "100 TL ödeme"         → "yüz TL ödeme"
 *   "+905551234567"        → DEĞİŞMEZ (telefon numarası)
 *   "{{customerName}}"     → DEĞİŞMEZ (placeholder)
 */

const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']

/**
 * 0-999 arası bir sayıyı Türkçe yazıya çevirir.
 */
function threeDigitsToWords(n: number): string {
  if (n === 0) return ''
  const parts: string[] = []

  // Yüzler
  const hundreds = Math.floor(n / 100)
  if (hundreds > 0) {
    if (hundreds === 1) {
      parts.push('yüz')
    } else {
      parts.push(ONES[hundreds] + ' yüz')
    }
  }

  // Onlar
  const remainder = n % 100
  const tens = Math.floor(remainder / 10)
  const ones = remainder % 10

  if (tens > 0) parts.push(TENS[tens])
  if (ones > 0) parts.push(ONES[ones])

  return parts.join(' ')
}

/**
 * Pozitif tamsayıyı Türkçe yazıya çevirir.
 * Max: trilyon seviyesi
 */
export function numberToTurkish(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (n === 0) return 'sıfır'

  const isNegative = n < 0
  const abs = Math.abs(Math.floor(n))

  // Çok büyük sayılar (milyon, milyar, trilyon)
  if (abs >= 1_000_000_000_000) {
    const trillions = Math.floor(abs / 1_000_000_000_000)
    const rest = abs % 1_000_000_000_000
    const trillionStr = (trillions === 1 ? '' : numberToTurkish(trillions) + ' ') + 'trilyon'
    return (isNegative ? 'eksi ' : '') + (rest > 0 ? trillionStr + ' ' + numberToTurkish(rest) : trillionStr)
  }
  if (abs >= 1_000_000_000) {
    const billions = Math.floor(abs / 1_000_000_000)
    const rest = abs % 1_000_000_000
    const billionStr = (billions === 1 ? '' : numberToTurkish(billions) + ' ') + 'milyar'
    return (isNegative ? 'eksi ' : '') + (rest > 0 ? billionStr + ' ' + numberToTurkish(rest) : billionStr)
  }
  if (abs >= 1_000_000) {
    const millions = Math.floor(abs / 1_000_000)
    const rest = abs % 1_000_000
    const millionStr = (millions === 1 ? '' : numberToTurkish(millions) + ' ') + 'milyon'
    return (isNegative ? 'eksi ' : '') + (rest > 0 ? millionStr + ' ' + numberToTurkish(rest) : millionStr)
  }
  if (abs >= 1000) {
    const thousands = Math.floor(abs / 1000)
    const rest = abs % 1000
    const thousandStr = (thousands === 1 ? '' : threeDigitsToWords(thousands) + ' ') + 'bin'
    return (isNegative ? 'eksi ' : '') + (rest > 0 ? thousandStr + ' ' + threeDigitsToWords(rest) : thousandStr)
  }

  const result = threeDigitsToWords(abs)
  return (isNegative ? 'eksi ' : '') + result
}

/**
 * Ondalıklı sayı: 14.5 → "on dört virgül beş"
 */
export function decimalToTurkish(n: number): string {
  if (Number.isInteger(n)) return numberToTurkish(n)

  const str = n.toString()
  const [intPart, decPart] = str.split('.')

  const intWords = numberToTurkish(parseInt(intPart, 10))
  // Ondalık kısım: her rakamı tek tek söyle (örn 0.05 → "sıfır virgül sıfır beş")
  const decWords = decPart.split('').map(d => {
    if (d === '0') return 'sıfır'
    return ONES[parseInt(d, 10)] || ''
  }).join(' ')

  return `${intWords} virgül ${decWords}`
}

/**
 * Saat formatı: "14:30" → "saat on dört otuz"
 */
export function timeToTurkish(timeStr: string): string {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return timeStr

  const hours = parseInt(match[1], 10)
  const mins = parseInt(match[2], 10)

  if (mins === 0) {
    return `saat ${numberToTurkish(hours)}`
  }
  return `saat ${numberToTurkish(hours)} ${numberToTurkish(mins)}`
}

/**
 * Tarih formatı: "15.06.2026" veya "15/06/2026" → "on beş haziran iki bin yirmi altı"
 */
const MONTHS = ['', 'ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran',
                'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık']

export function dateToTurkish(dateStr: string): string {
  const match = dateStr.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (!match) return dateStr

  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)

  if (month < 1 || month > 12) return dateStr

  return `${numberToTurkish(day)} ${MONTHS[month]} ${numberToTurkish(year)}`
}

/**
 * Metin içindeki tüm rakamları Türkçeye dönüştürür.
 *
 * Korunanlar:
 *   - {{placeholder}} içeriği
 *   - Telefon numaraları (+90... veya 0... ile başlayan 10+ rakam)
 *   - URL'ler (http://, https://, www.)
 *   - Tool/değişken kodları (snake_case_with_numbers, vb.)
 *
 * Dönüştürülen:
 *   - Saat formatı: 14:30 → "saat on dört otuz"
 *   - Tarih formatı: 15.06.2026 → "on beş haziran iki bin yirmi altı"
 *   - Standalone sayılar: 100 → "yüz"
 *   - Ondalıklı sayılar: 14.5 → "on dört virgül beş"
 */
export function convertNumbersInText(text: string): string {
  if (!text) return text

  // 1. Placeholder'ları geçici olarak koru: {{anything}}
  const placeholders: string[] = []
  let result = text.replace(/\{\{[^}]+\}\}/g, (match) => {
    placeholders.push(match)
    return `__PLACEHOLDER_${placeholders.length - 1}__`
  })

  // 2. URL'leri koru
  const urls: string[] = []
  result = result.replace(/https?:\/\/\S+|www\.\S+/g, (match) => {
    urls.push(match)
    return `__URL_${urls.length - 1}__`
  })

  // 3. Telefon numaralarını koru (uluslararası ve yerel)
  const phones: string[] = []
  result = result.replace(/(?:\+\d{1,3}[\s-]?)?(?:\(\d+\)[\s-]?)?\d{3,}[\s-]?\d{2,}[\s-]?\d{2,}/g, (match) => {
    // En az 9 rakam içeriyorsa telefon say
    const digitCount = (match.match(/\d/g) || []).length
    if (digitCount >= 9) {
      phones.push(match)
      return `__PHONE_${phones.length - 1}__`
    }
    return match
  })

  // 4. Tarih formatı: 15.06.2026 veya 15/06/2026 veya 15-06-2026
  result = result.replace(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/g, (match) => {
    return dateToTurkish(match)
  })

  // 5. Saat formatı: 14:30
  result = result.replace(/\b(\d{1,2}):(\d{2})\b/g, (match) => {
    return timeToTurkish(match)
  })

  // 6. Yüzde: %20 → "yüzde yirmi"
  result = result.replace(/%(\d+(?:\.\d+)?)/g, (_, num) => {
    return `yüzde ${decimalToTurkish(parseFloat(num))}`
  })

  // 7. Para birimi: 100 TL, 100₺, 100 lira
  result = result.replace(/(\d+(?:\.\d+)?)\s*(TL|tl|₺|lira)\b/g, (_, num) => {
    return `${decimalToTurkish(parseFloat(num))} lira`
  })

  // 8. Standalone ondalıklı sayılar: 14.5, 0.5 (ama tarih olmayanlar)
  result = result.replace(/\b(\d+\.\d+)\b/g, (match) => {
    return decimalToTurkish(parseFloat(match))
  })

  // 9. Standalone tamsayılar (5 haneye kadar)
  result = result.replace(/\b(\d{1,5})\b/g, (match) => {
    const num = parseInt(match, 10)
    return numberToTurkish(num)
  })

  // 10. Placeholder'ları geri koy
  result = result.replace(/__PLACEHOLDER_(\d+)__/g, (_, idx) => {
    return placeholders[parseInt(idx, 10)] || ''
  })
  result = result.replace(/__URL_(\d+)__/g, (_, idx) => {
    return urls[parseInt(idx, 10)] || ''
  })
  result = result.replace(/__PHONE_(\d+)__/g, (_, idx) => {
    return phones[parseInt(idx, 10)] || ''
  })

  return result
}
