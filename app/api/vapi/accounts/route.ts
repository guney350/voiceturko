/**
 * @deprecated — Bu API artık kullanılmıyor.
 * API key yönetimi admin panelden yapılır: /api/admin/pool
 * Kullanıcılar VAPI hesaplarını görmez.
 */

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ 
    error: 'Bu endpoint kaldırıldı. API key yönetimi admin panelden yapılır.',
    redirect: '/api/admin/pool'
  }, { status: 410 })
}

export async function POST() {
  return NextResponse.json({ 
    error: 'Bu endpoint kaldırıldı. API key yönetimi admin panelden yapılır.',
    redirect: '/api/admin/pool'
  }, { status: 410 })
}