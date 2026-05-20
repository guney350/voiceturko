/**
 * Admin: Kullanıcıya kredi hediye et (TL bakiyesine ekle)
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
    const { userId, amount } = await request.json()
    const amt = parseFloat(amount)
    if (!userId || !amt || amt <= 0) {
      return NextResponse.json(
        { error: 'userId ve geçerli bir amount (TL) zorunludur' },
        { status: 400 }
      )
    }

    const result = await Billing.topupCredit(
      userId,
      amt,
      `admin_grant_${Date.now()}`,
      'admin_grant'
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      newBalance: result.newBalance,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
