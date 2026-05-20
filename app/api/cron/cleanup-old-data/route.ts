/**
 * Cron: Eski verileri temizle
 * Her gün 03:00'te çalışır.
 * - 90 günden eski audit logs sil
 * - 30 günden eski pool_usage_logs sil
 * - 60 günden eski campaign_logs sil
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const stats = {
    audit_logs: 0,
    pool_usage_logs: 0,
    campaign_logs: 0,
  }

  try {
    // 90 gün eski audit logs
    const auditThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const { count: a } = await supabase
      .from('audit_logs')
      .delete({ count: 'exact' })
      .lt('created_at', auditThreshold)
    stats.audit_logs = a || 0

    // 30 gün eski pool_usage_logs
    const poolThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { count: p } = await supabase
      .from('pool_usage_logs')
      .delete({ count: 'exact' })
      .lt('created_at', poolThreshold)
    stats.pool_usage_logs = p || 0

    // 60 gün eski campaign_logs (sadece info/success)
    const campaignThreshold = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    const { count: c } = await supabase
      .from('campaign_logs')
      .delete({ count: 'exact' })
      .lt('created_at', campaignThreshold)
      .in('level', ['info', 'success'])
    stats.campaign_logs = c || 0

    return NextResponse.json({
      success: true,
      deleted: stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
