/**
 * Campaign counter'larını campaign_items'ın gerçek durumundan yeniden hesapla.
 * Bozuk sync durumlarında kullanılır.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminDb = createAdminClient()

    // Kampanya sahibi mi?
    const { data: campaign } = await adminDb
      .from('campaigns')
      .select('id, user_id, total_contacts')
      .eq('id', id)
      .single()

    if (!campaign || campaign.user_id !== user.id) {
      return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 })
    }

    // campaign_items'tan gerçek sayıları topla
    const { data: items } = await adminDb
      .from('campaign_items')
      .select('status')
      .eq('campaign_id', id)

    const all = items || []
    const completed = all.filter(i => i.status === 'completed').length
    const failed = all.filter(i => i.status === 'failed' || i.status === 'cancelled').length
    const pending = all.filter(i => i.status === 'pending').length
    const calling = all.filter(i => i.status === 'calling' || i.status === 'locked').length
    const retryWait = all.filter(i => i.status === 'retry_wait').length

    // Successful = completed (assuming completed = success in current model)
    const successful = completed

    const totalDone = completed + failed
    const allFinished = (pending + calling + retryWait) === 0 && totalDone > 0

    // Campaign'ı güncelle
    const updates: Record<string, unknown> = {
      completed_calls: completed + failed,
      successful_calls: successful,
      failed_calls: failed,
      pending_calls: pending,
      active_call_count: calling,
    }

    // Eğer tüm itemlar bittiyse status='completed' yap
    if (allFinished) {
      updates.status = 'completed'
      updates.completed_at = new Date().toISOString()
    }

    await adminDb.from('campaigns').update(updates).eq('id', id)

    return NextResponse.json({
      success: true,
      counters: {
        total: all.length,
        completed,
        failed,
        pending,
        calling,
        retryWait,
        successful,
      },
      allFinished,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
