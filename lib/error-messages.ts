/**
 * Hata mesajlarını Türkçe'ye çevir
 * Supabase, Stripe, VAPI ve sistem hatalarını kullanıcı dostu hale getirir
 */

const errorMap: Record<string, string> = {
  // Supabase Auth
  'Invalid login credentials': 'Email veya şifre hatalı',
  'User already registered': 'Bu email adresi zaten kayıtlı',
  'Email not confirmed': 'Lütfen önce email adresinizi doğrulayın',
  'Email rate limit exceeded': 'Çok fazla deneme yaptınız, lütfen biraz bekleyin',
  'Password should be at least 6 characters': 'Şifre en az 6 karakter olmalıdır',
  'Unable to validate email address: invalid format': 'Geçersiz email formatı',
  'Signups not allowed for this instance': 'Yeni kayıt şu anda kapalı',
  'User not found': 'Kullanıcı bulunamadı',

  // Pool / VAPI
  'POOL_CAPACITY_FULL': 'Tüm hatlarınız dolu, lütfen birkaç saniye bekleyin',
  'NO_KEYS_ASSIGNED': 'Hesabınıza henüz API key tahsis edilmemiş, lütfen destek ile iletişime geçin',
  'NO_ACTIVE_KEYS': 'Tahsis edilmiş key\'lerinizin hiçbiri aktif değil',
  'PROVISION_FAILED': 'VAPI sistemine kayıt başarısız',
  'INSUFFICIENT_MINUTES': 'Yeterli dakika hakkınız yok, lütfen plan satın alın veya ek dakika ekleyin',
  'NO_SIP_CONFIGURED': 'Önce SIP ayarlarınızı yapmalısınız',
  'RESOURCES_NOT_FOUND': 'Gerekli kaynaklar bulunamadı, lütfen SIP ve Asistan ayarlarınızı kontrol edin',
  'API_KEY_INACTIVE': 'API key inaktif, lütfen destek ile iletişime geçin',

  // Generic
  'Network request failed': 'İnternet bağlantı hatası',
  'Failed to fetch': 'Sunucuya ulaşılamadı',
}

/**
 * Hata mesajını Türkçe'ye çevir
 */
export function localizeError(err: unknown): string {
  if (!err) return 'Bilinmeyen hata'

  let message: string

  if (err instanceof Error) {
    message = err.message
  } else if (typeof err === 'string') {
    message = err
  } else if (typeof err === 'object' && err !== null && 'message' in err) {
    message = String((err as { message: unknown }).message)
  } else {
    message = String(err)
  }

  // Önek kontrolü (POOL_CAPACITY_FULL: ...)
  for (const [key, value] of Object.entries(errorMap)) {
    if (message === key || message.startsWith(`${key}:`)) {
      return value
    }
  }

  // Tam eşleşme
  if (errorMap[message]) {
    return errorMap[message]
  }

  return message || 'Bilinmeyen hata'
}
