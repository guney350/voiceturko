import { redirect } from 'next/navigation'

/**
 * /dashboard/plans → /dashboard/packages'a yönlendir
 *
 * Eski plan sistemi (subscriptions tablosu) yerine yeni paket sistemi (minute_packages) kullanılıyor.
 * Bu sayfa eski URL'den gelen kullanıcılar için bir redirect noktası.
 */
export default function PlansPage() {
  redirect('/dashboard/packages')
}
