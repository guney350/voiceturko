/**
 * Kampanyayı manuel olarak tamamla
 * - Tüm pending/calling/locked/retry_wait item'ları "cancelled" yapar
 * - Active aramaları durdurmaz (zaten devam etmesini bekleriz)
 * - campaign.status = 'completed' set eder
 */
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Kampanya sahibi mi?
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!campaign) return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 })
    if (campaign.status === 'completed') {
      return NextResponse.json({ success: true, alreadyCompleted: true })
    }

    // Aktif olmayan item'ları cancelled yap (calling ve locked olanlara dokunma; bittiğinde otomatik düşer)
    const { count: pendingCount } = await supabase
      .from('campaign_items')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', id)
      .in('status', ['pending', 'retry_wait'])

    if ((pendingCount || 0) > 0) {
      await supabase
        .from('campaign_items')
        .update({ status: 'cancelled', completed_at: new Date().toISOString() })
        .eq('campaign_id', id)
        .in('status', ['pending', 'retry_wait'])
    }

    // Active aramalar bittiğinde campaign zaten auto-complete olur (call-lifecycle içinde)
    // Ama emin olmak için: eğer aktif arama yoksa, hemen complete et
    const { count: activeCount } = await supabase
      .from('campaign_items')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', id)
      .in('status', ['calling', 'locked'])

    if ((activeCount || 0) === 0) {
      await supabase
        .from('campaigns')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', id)

      await supabase.from('campaign_logs').insert({
        campaign_id: id,
        level: 'success',
        message: 'Kampanya manuel olarak tamamlandı',
      })

      return NextResponse.json({
        success: true,
        completed: true,
        cancelledItems: pendingCount || 0,
      })
    }

    // Active aramalar var - kampanya pause'a alındı, bittiğinde otomatik complete olur
    await supabase
      .from('campaigns')
      .update({ status: 'paused', paused_at: new Date().toISOString(), pause_reason: 'manual_complete_requested' })
      .eq('id', id)

    await supabase.from('campaign_logs').insert({
      campaign_id: id,
      level: 'info',
      message: `Manuel tamamlama: ${pendingCount || 0} bekleyen kayıt iptal edildi, ${activeCount} aktif arama bittiğinde kampanya kapanacak`,
    })

    return NextResponse.json({
      success: true,
      pendingActive: activeCount,
      cancelledItems: pendingCount || 0,
      message: 'Aktif aramalar bittiğinde kampanya tamamlanacak',
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Hata'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
