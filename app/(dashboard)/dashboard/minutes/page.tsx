import { redirect } from 'next/navigation'

/**
 * /dashboard/minutes → /dashboard/credits'e yönlendir
 *
 * Eski "Ek Dakika Satın Al" sayfası yerine yeni kredi sistemi kullanılıyor.
 */
export default function MinutesPage() {
  redirect('/dashboard/credits')
}
