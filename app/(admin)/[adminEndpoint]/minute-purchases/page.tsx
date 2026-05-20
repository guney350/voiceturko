import { redirect } from 'next/navigation'
import { getAdminEndpoint } from '@/lib/admin'

/**
 * @deprecated Eski dakika satışları. Yeni: package_purchases + credit_transactions
 */
export default function MinutePurchasesPage() {
  const adminEndpoint = getAdminEndpoint()
  redirect(`/${adminEndpoint}`)
}
