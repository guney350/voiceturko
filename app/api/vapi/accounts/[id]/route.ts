/**
 * @deprecated — Bu API artık kullanılmıyor.
 */

import { NextResponse } from 'next/server'

export async function PUT() {
  return NextResponse.json({ error: 'Bu endpoint kaldırıldı.' }, { status: 410 })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Bu endpoint kaldırıldı.' }, { status: 410 })
}