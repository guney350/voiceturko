/**
 * @deprecated — Bu API artık kullanılmıyor.
 */

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'Bu endpoint kaldırıldı. Admin panelden API key ekleyin.' }, { status: 410 })
}