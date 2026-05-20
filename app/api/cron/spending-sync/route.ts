/**
 * Cron: Spending Sync
 * Her 15 dakikada bir vapi_accounts.total_spent'i calls tablosundan recompute eder.
 * Drift düzeltir (webhook miss, sync hatası vs).
 */

import { NextRequest, NextResponse } from 'next/server'
import { KeyRotation } from '@/lib/vapi/key-rotation'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await KeyRotation.syncSpendingFromCalls()

    return NextResponse.json({
      success: true,
      synced: result.synced,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
