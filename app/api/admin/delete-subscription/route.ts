/**
 * @deprecated Eski subscription silme. Kullanım dışı.
 */
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Bu endpoint kullanım dışıdır.' },
    { status: 410 }
  )
}
