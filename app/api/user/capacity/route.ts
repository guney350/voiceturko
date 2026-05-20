/**
 * Kullanıcının VAPI kapasite bilgisini döner
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VapiPoolManager } from '@/lib/vapi/pool-manager'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keys = await VapiPoolManager.getUserAssignedKeys(user.id)

    const totalCapacity = keys.reduce(
      (sum, k) => sum + (k.max_concurrent_calls || 10),
      0
    )

    const usedCapacity = keys.reduce(
      (sum, k) => sum + (k.current_active_calls || 0),
      0
    )

    return NextResponse.json({
      success: true,
      assignedKeys: keys.length,
      totalCapacity,
      usedCapacity,
      availableCapacity: totalCapacity - usedCapacity,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('Capacity error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
