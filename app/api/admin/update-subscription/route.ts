/**
 * @deprecated Eski subscription sistemi kullanım dışı.
 * Yerine /api/admin/activate-package kullanın.
 */
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error: 'Bu endpoint kullanım dışıdır. Lütfen /api/admin/activate-package kullanın.',
    },
    { status: 410 }
  )
}
