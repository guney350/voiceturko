/**
 * Kullanıcının kredi transaction history'si
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

    const transactions = await Billing.getRecentTransactions(user.id, 20)

    return NextResponse.json({
      success: true,
      transactions,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
