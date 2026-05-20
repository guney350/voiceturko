import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Kampanyayı kontrol et
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Kampanya bulunamadı' }, { status: 404 })
    }

    if (campaign.status !== 'running') {
      return NextResponse.json(
        { error: 'Sadece çalışan kampanyalar duraklatılabilir' },
        { status: 400 }
      )
    }

    // ÖNCE: Tüm itemler tamamlandı mı kontrol et
    // Eğer tamamlandıysa pause yerine COMPLETED yap (kullanıcı yanlışlıkla pausladıysa)
    const { count: incompleteCount } = await supabase
      .from('campaign_items')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', id)
      .in('status', ['pending', 'calling', 'locked', 'retry_wait'])

    if ((incompleteCount || 0) === 0) {
      // Aslında tamamlanmış, complete yap
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
        message: 'Kampanya tamamlandı (tüm aramalar bitmiş)',
      })

      return NextResponse.json({
        success: true,
        autoCompleted: true,
        message: 'Tüm aramalar zaten tamamlanmış, kampanya completed olarak işaretlendi',
      })
    }

    // Normal duraklatma
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({
        status: 'paused',
        paused_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await supabase.from('campaign_logs').insert({
      campaign_id: id,
      level: 'info',
      message: 'Kampanya duraklatıldı'
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Pause campaign error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}