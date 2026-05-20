import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/vapi/phone-numbers/add
 * SIP Phone Number ekle (credential ile birlikte)
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
      phoneNumber,
      name,
      credentialId,
      numberE164CheckEnabled = true,
      // Credential bilgileri (eğer credentialId yoksa)
      credentialName,
      gateways,
      authUsername,
      authPassword
    } = body
    
    // Validasyon
    if (!phoneNumber || !name) {
      return NextResponse.json(
        { error: 'Phone number ve name gerekli' },
        { status: 400 }
      )
    }
    
    // Aktif VAPI hesabını al
    const { data: account } = await supabase
      .from('vapi_accounts')
      .select('api_key, id')
      .eq('user_id', user.id)
      .eq('is_current', true)
      .single()
    
    if (!account) {
      return NextResponse.json(
        { error: 'Aktif VAPI hesabı bulunamadı' },
        { status: 404 }
      )
    }
    
    let finalCredentialId = credentialId
    
    // Eğer credentialId yoksa, önce credential oluştur
    if (!finalCredentialId && gateways && authUsername && authPassword) {
      console.log('📝 Credential oluşturuluyor...')
      
      const credentialPayload = {
        provider: 'byo-sip-trunk',
        name: credentialName || `${name} SIP Trunk`,
        gateways: gateways.map((gw: any) => ({
          ip: gw.ip,
          port: gw.port || 5060,
          inboundEnabled: gw.inboundEnabled !== false
        })),
        outboundLeadingPlusEnabled: true,
        outboundAuthenticationPlan: {
          authUsername,
          authPassword
        }
      }
      
      const credResponse = await fetch('https://api.vapi.ai/credential', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.api_key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentialPayload)
      })
      
      const credData = await credResponse.json()
      
      if (!credResponse.ok) {
        return NextResponse.json(
          { error: 'Credential oluşturulamadı', detail: credData },
          { status: credResponse.status }
        )
      }
      
      finalCredentialId = credData.id
      console.log('✅ Credential oluşturuldu:', finalCredentialId)
    }
    
    if (!finalCredentialId) {
      return NextResponse.json(
        { error: 'Credential ID gerekli (ya credentialId ya da credential bilgileri sağlanmalı)' },
        { status: 400 }
      )
    }
    
    // Phone number oluştur
    const phonePayload = {
      provider: 'byo-phone-number',
      number: phoneNumber,
      numberE164CheckEnabled,
      credentialId: finalCredentialId,
      name
    }
    
    console.log('📤 VAPI Phone Number oluşturuluyor:', JSON.stringify(phonePayload, null, 2))
    
    const phoneResponse = await fetch('https://api.vapi.ai/phone-number', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(phonePayload)
    })
    
    const phoneData = await phoneResponse.json()
    
    console.log(`📥 VAPI Phone Number yanıtı (${phoneResponse.status}):`, JSON.stringify(phoneData, null, 2))
    
    if (!phoneResponse.ok) {
      return NextResponse.json(
        { error: phoneData.message || 'Phone number oluşturulamadı', detail: phoneData },
        { status: phoneResponse.status }
      )
    }
    
    // Database'e kaydet
    const { error: dbError } = await supabase
      .from('vapi_phone_numbers')
      .insert({
        user_id: user.id,
        vapi_account_id: account.id,
        vapi_phone_number_id: phoneData.id,
        phone_number: phoneNumber,
        name: name,
        provider: 'byo-phone-number',
        is_active: true,
        is_default: false // İlk telefon numarası değilse false
      })
    
    if (dbError) {
      console.error('Database kayıt hatası:', dbError)
      // VAPI'ye eklendi ama database'e kaydedilemedi - warning ver ama devam et
    }
    
    return NextResponse.json({
      success: true,
      phoneNumber: phoneData,
      credentialId: finalCredentialId
    })
    
  } catch (error: any) {
    console.error('Phone number ekleme hatası:', error)
    return NextResponse.json(
      { error: error.message || 'Sunucu hatası' },
      { status: 500 }
    )
  }
}