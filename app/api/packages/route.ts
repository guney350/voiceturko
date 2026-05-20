/**
 * Aktif paketleri listele (kamuya açık)
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('minute_packages')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    return NextResponse.json({ success: true, packages: data || [] })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
