/**
 * Admin: Kullanıcıya paket ata (ücretsiz aktivasyon)
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { Billing } from '@/lib/billing'

async function verifyAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === 'verified'
}

export async function POST(request: Request) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { userId, packageId } = await request.json()
    if (!userId || !packageId) {
      return NextResponse.json(
        { error: 'userId ve packageId zorunludur' },
        { status: 400 }
      )
    }

    const result = await Billing.activatePackage(
      userId,
      packageId,
      `admin_grant_${Date.now()}`
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      minutes: result.minutes,
      pricePerMinute: result.pricePerMinute,
      totalPrice: result.totalPrice,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
