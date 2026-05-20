/**
 * @deprecated Eski dakika ekleme. Kullanım dışı.
 * Yerine /api/admin/grant-credit (TL bazlı) veya /api/admin/activate-package (paket bazlı) kullanın.
 */
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error: 'Bu endpoint kullanım dışıdır. Yeni sistem TL kredi ve paket dakika kullanır.',
    },
    { status: 410 }
  )
}
