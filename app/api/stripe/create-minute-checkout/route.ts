/**
 * @deprecated Eski subscription-tabanlı dakika satın alma. Kullanım dışı.
 * Yerine /api/stripe/create-credit-checkout kullanın.
 */
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error: 'Bu endpoint kullanım dışıdır.',
      redirect: '/dashboard/credits',
      message: 'Lütfen yeni kredi sistemini kullanın: /dashboard/credits',
    },
    { status: 410 }
  )
}
