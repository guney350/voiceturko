import { redirect } from 'next/navigation'
import { getAdminEndpoint } from '@/lib/admin'

/**
 * @deprecated Eski faturalama. Yeni: payment_intents (Stripe + Oxapay)
 */
export default function InvoicesPage() {
  const adminEndpoint = getAdminEndpoint()
  redirect(`/${adminEndpoint}`)
}
