/**
 * Kullanıcı dashboard istatistikleri
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sb = createAdminClient()

    // Bu ay başı
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

    const [callsThisMonth, balance, totalUsage] = await Promise.all([
      sb.from('calls').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', monthStart),
      sb.from('user_balances')
        .select('total_minutes_used, package_id, minute_packages(name)')
        .eq('user_id', user.id)
        .maybeSingle(),
      sb.from('calls').select('duration_minutes').eq('user_id', user.id),
    ])

    const totalMinutesUsed = balance.data?.total_minutes_used ||
      (totalUsage.data || []).reduce((s, c) => s + (parseFloat(c.duration_minutes) || 0), 0)

    const pkg = balance.data?.minute_packages as { name?: string } | undefined

    return NextResponse.json({
      success: true,
      callsThisMonth: callsThisMonth.count || 0,
      totalMinutesUsed: Math.floor(totalMinutesUsed),
      packageName: pkg?.name || null,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
