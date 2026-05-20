/**
 * Cron: Key Auto-Rotation
 * Her 5 dakikada bir çalışır.
 * Spending limit'i aşmış key'leri tespit eder ve user'ların havuzundan değiştirir.
 */

import { NextRequest, NextResponse } from 'next/server'
import { KeyRotation } from '@/lib/vapi/key-rotation'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await KeyRotation.runRotationCycle()

    return NextResponse.json({
      success: true,
      rotated: result.rotated,
      failed: result.failed,
      details: result.details,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('[Cron] Key rotation hatası:', msg)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
