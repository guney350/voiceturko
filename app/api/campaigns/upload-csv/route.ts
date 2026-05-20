import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const campaignId = formData.get('campaignId') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 })
    }

    // Kampanyanın kullanıcıya ait olduğunu kontrol et
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // CSV dosyasını oku
    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'CSV dosyası en az 1 kişi içermelidir' },
        { status: 400 }
      )
    }

    // Header'ı atla, sadece veriyi al
    const dataLines = lines.slice(1)
    const contacts = dataLines
      .map((line, index) => {
        const parts = line.split(',').map(p => p.trim())
        return {
          campaign_id: campaignId,
          customer_name: parts[0] || '',
          customer_phone: parts[2] || '',
          customer_data: parts[1] ? { gender: parts[1] } : null,
          call_order: index + 1,
          status: 'pending',
        }
      })
      .filter(item => item.customer_name && item.customer_phone)

    if (contacts.length === 0) {
      return NextResponse.json(
        { error: 'CSV dosyasında geçerli veri bulunamadı' },
        { status: 400 }
      )
    }

    // Kişileri campaign_items tablosuna ekle
    const { error: insertError } = await supabase
      .from('campaign_items')
      .insert(contacts)

    if (insertError) {
      throw insertError
    }

    // Kampanya istatistiklerini güncelle
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({
        total_contacts: contacts.length,
        pending_calls: contacts.length,
      })
      .eq('id', campaignId)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      success: true,
      count: contacts.length,
      contacts: contacts.slice(0, 5), // İlk 5 kişiyi önizleme için döndür
    })
  } catch (error: any) {
    console.error('CSV upload error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}