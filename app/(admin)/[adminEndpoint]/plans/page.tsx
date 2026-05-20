import { redirect } from 'next/navigation'
import { getAdminEndpoint } from '@/lib/admin'

/**
 * @deprecated Eski plans tablosu kullanım dışı.
 * Yeni: minute_packages için /admin/packages
 */
export default function PlansPage() {
  const adminEndpoint = getAdminEndpoint()
  redirect(`/${adminEndpoint}/packages`)
}
