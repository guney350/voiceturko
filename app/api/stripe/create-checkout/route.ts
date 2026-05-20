/**
 * @deprecated Eski subscription-tabanlı checkout. Kullanım dışı.
 * Yerine /api/stripe/create-package-checkout veya /api/stripe/create-credit-checkout kullanın.
 */
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error: 'Bu endpoint kullanım dışıdır.',
      redirect: '/dashboard/packages',
      message: 'Lütfen yeni paket sistemini kullanın: /dashboard/packages',
    },
    { status: 410 } // Gone
  )
}
