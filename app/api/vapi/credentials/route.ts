import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/vapi/credentials
 * SIP Trunk Credential oluştur
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Kullanıcı kontrolü
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const body = await request.json()
    const {
      name,
      provider = 'byo-sip-trunk',
      gateways,
      authUsername,
      authPassword,
      outboundLeadingPlusEnabled = true
    } = body
    
    // Validasyon
    if (!name || !gateways || !authUsername || !authPassword) {
      return NextResponse.json(
        { error: 'Name, gateways, authUsername ve authPassword gerekli' },
        { status: 400 }
      )
    }
    
    // Aktif VAPI hesabını al
    const { data: account } = await supabase
      .from('vapi_accounts')
      .select('api_key')
      .eq('user_id', user.id)
      .eq('is_current', true)
      .single()
    
    if (!account) {
      return NextResponse.json(
        { error: 'Aktif VAPI hesabı bulunamadı' },
        { status: 404 }
      )
    }
    
    // VAPI API'ye credential oluştur
    const credentialPayload = {
      provider,
      name,
      gateways: gateways.map((gw: any) => ({
        ip: gw.ip,
        port: gw.port || 5060,
        inboundEnabled: gw.inboundEnabled !== false
      })),
      outboundLeadingPlusEnabled,
      outboundAuthenticationPlan: {
        authUsername,
        authPassword
      }
    }
    
    console.log('📤 VAPI Credential oluşturuluyor:', JSON.stringify(credentialPayload, null, 2))
    
    const response = await fetch('https://api.vapi.ai/credential', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentialPayload)
    })
    
    const data = await response.json()
    
    console.log(`📥 VAPI Credential yanıtı (${response.status}):`, JSON.stringify(data, null, 2))
    
    if (!response.ok) {
      return NextResponse.json(
        { error: data.message || 'Credential oluşturulamadı', detail: data },
        { status: response.status }
      )
    }
    
    return NextResponse.json({
      success: true,
      credential: data
    })
    
  } catch (error: any) {
    console.error('Credential oluşturma hatası:', error)
    return NextResponse.json(
      { error: error.message || 'Sunucu hatası' },
      { status: 500 }
    )
  }
}