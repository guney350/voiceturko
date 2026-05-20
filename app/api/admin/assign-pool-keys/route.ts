/**
 * Admin: Kullanıcıya VAPI key tahsis et
 * Eksik kalan slotları (max 10) doldurur.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { VapiPoolManager } from '@/lib/vapi/pool-manager'

async function verifyAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === 'verified'
}

export async function POST(request: NextRequest) {
  try {
    if (!await verifyAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, count } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId zorunludur' }, { status: 400 })
    }

    const targetCount = count || 10
    const assigned = await VapiPoolManager.assignKeysToUser(userId, targetCount)

    const allKeys = await VapiPoolManager.getUserAssignedKeys(userId)

    return NextResponse.json({
      success: true,
      assigned,
      total: allKeys.length,
    })
  } catch (error) {
    console.error('Key tahsis hatası:', error)
    const msg = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
