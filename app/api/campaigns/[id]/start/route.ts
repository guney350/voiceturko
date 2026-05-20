import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { CampaignProcessor } from '@/lib/campaign/processor'

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

    // Hem yeni baslatma hem duraklatilmistan devam etme (resume)
    if (!['pending', 'draft', 'paused'].includes(campaign.status)) {
      return NextResponse.json(
        { error: 'Sadece bekleyen, taslak veya duraklatilmis kampanyalar baslatilabilir' },
        { status: 400 }
      )
    }

    // Atomik status update: race-free baslatma (iki paralel istek -> ikisi de running yapamaz)
    const isResume = campaign.status === 'paused'
    const updateData: Record<string, unknown> = {
      status: 'running',
      last_heartbeat_at: new Date().toISOString(),
      pause_reason: null,
      paused_at: null,
    }
    if (!isResume) {
      updateData.started_at = new Date().toISOString()
    }

    const { error: updateError, data: updated } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', id)
      .in('status', ['pending', 'draft', 'paused']) // atomik guard
      .select('id')

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Kampanya zaten baslatilmis (yarisma) - tarayiciyi yenileyin' }, { status: 409 })
    }

    await supabase.from('campaign_logs').insert({
      campaign_id: id,
      level: 'info',
      message: isResume ? 'Kampanya devam ettirildi' : 'Kampanya baslatildi'
    })

    // İlk tick'i tetikle (background - hata olsa bile yanit don)
    CampaignProcessor.tick(id, user.id).catch(err => {
      console.error('[start] initial tick error:', err)
    })

    return NextResponse.json({ success: true, resumed: isResume })
  } catch (error: any) {
    console.error('Start campaign error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}