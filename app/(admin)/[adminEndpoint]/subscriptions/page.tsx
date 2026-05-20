import { redirect } from 'next/navigation'
import { getAdminEndpoint } from '@/lib/admin'

/**
 * @deprecated Eski subscription sistemi kullanım dışı.
 * Yeni: kullanıcı paketleri için /admin/users sayfasına yönlendirilir.
 */
export default function SubscriptionsPage() {
  const adminEndpoint = getAdminEndpoint()
  redirect(`/${adminEndpoint}/users`)
}
