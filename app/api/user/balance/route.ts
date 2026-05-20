/**
 * Kullanıcının bakiyesi (paket + kredi)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Billing } from '@/lib/billing'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const balance = await Billing.getBalance(user.id)
    const capacity = await Billing.getCallCapacity(user.id)

    return NextResponse.json({
      success: true,
      balance,
      capacity,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
