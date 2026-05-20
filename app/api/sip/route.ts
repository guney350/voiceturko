/**
 * User SIP API
 * Kullanıcılar SIP trunk ekler/günceller/siler.
 * Arka planda VapiPoolManager ile VAPI'ye provision edilir.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VapiPoolManager } from '@/lib/vapi/pool-manager'

// SIP Trunk oluştur + VAPI'ye provision et
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { name, ipAddress, port, username, password, phoneNumber } = await request.json()

    if (!name || !ipAddress || !port || !username || !password || !phoneNumber) {
      return NextResponse.json({
        error: 'name, ipAddress, port, username, password ve phoneNumber zorunludur'
      }, { status: 400 })
    }

    // Validasyon
    if (!/^\+?[1-9]\d{9,14}$/.test(phoneNumber.replace(/\s/g, ''))) {
      return NextResponse.json({ error: 'Geçersiz telefon numarası formatı (E.164)' }, { status: 400 })
    }
    if (!/^\d+$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535) {
      return NextResponse.json({ error: 'Geçersiz port numarası' }, { status: 400 })
    }

    // E.164 format kontrolü
    let e164Number = phoneNumber.replace(/\s/g, '')
    if (!e164Number.startsWith('+')) {
      e164Number = `+${e164Number}`
    }

    const adminDb = createAdminClient()

    // Idempotency: aynı user+phone kombinasyonu varsa hata ver
    const { data: existing } = await adminDb
      .from('sips')
      .select('id')
      .eq('user_id', user.id)
      .eq('phone_number', e164Number)
      .eq('is_active', true)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({
        error: `Bu telefon numarası (${e164Number}) zaten kayıtlı`,
      }, { status: 409 })
    }

    // 1. DB'ye SIP kaydı oluştur (password select etmiyoruz!)
    const { data: sipRecord, error: sipError } = await adminDb
      .from('sips')
      .insert({
        user_id: user.id,
        name,
        ip_address: ipAddress,
        port: Number(port),
        username,
        password,
        phone_number: e164Number,
        is_active: true,
      })
      .select('id, name, ip_address, port, username, phone_number, is_active, created_at')
      .single()

    if (sipError) throw sipError

    // 2. VAPI'ye provision et (10 key'in HEPSİNE)
    try {
      const result = await VapiPoolManager.provisionSipTrunk(user.id, {
        sipId: sipRecord.id,
        name,
        ipAddress,
        port: Number(port),
        username,
        password,
        phoneNumber: e164Number,
      })

      return NextResponse.json({
        success: true,
        data: {
          ...sipRecord,
          vapi_provisioned: result.successful > 0,
          provisioning: {
            successful: result.successful,
            failed: result.failed,
            total: result.total,
            warnings: result.warnings,
          },
        },
      })
    } catch (vapiError) {
      // VAPI hatası olursa DB kaydını sil
      await adminDb.from('sips').delete().eq('id', sipRecord.id)
      console.error('[SIP API] VAPI provision hatası:', vapiError)
      return NextResponse.json({
        error: 'SIP trunk VAPI\'ye kaydedilemedi. Hesabınıza key tahsis edilmemiş olabilir.',
        detail: vapiError instanceof Error ? vapiError.message : 'Bilinmeyen hata',
      }, { status: 503 })
    }

  } catch (error) {
    console.error('[SIP API] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Kullanıcının SIP'lerini listele
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('sips')
      .select('id, name, ip_address, port, username, phone_number, is_active, created_at, vapi_synced_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error) {
    console.error('[SIP API] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// SIP Trunk guncelle - DB'yi degistir VE VAPI'deki credential/phone_number'i sil+yenile
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sipId, name, ipAddress, port, username, password, phoneNumber } = await request.json()

    if (!sipId || !name || !ipAddress || !port || !username || !password || !phoneNumber) {
      return NextResponse.json({ error: 'Tum alanlar zorunlu' }, { status: 400 })
    }

    let e164Number = phoneNumber.replace(/\s/g, '')
    if (!e164Number.startsWith('+')) e164Number = `+${e164Number}`

    const adminDb = createAdminClient()

    // Sahiplik kontrol
    const { data: existing } = await adminDb
      .from('sips')
      .select('*')
      .eq('id', sipId)
      .eq('user_id', user.id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'SIP bulunamadi veya yetki yok' }, { status: 404 })
    }

    // 1) DB guncellemesi
    await adminDb.from('sips').update({
      name,
      ip_address: ipAddress,
      port: Number(port),
      username,
      password,
      phone_number: e164Number,
    }).eq('id', sipId)

    // 2) VAPI temizligi: eski credential ve phone_number kayitlarini sil
    const { data: oldResources } = await adminDb
      .from('vapi_resources')
      .select('*')
      .eq('local_resource_id', sipId)
      .eq('local_resource_type', 'sip')
      .eq('is_active', true)

    if (oldResources && oldResources.length > 0) {
      const accountIds = [...new Set(oldResources.map(r => r.vapi_account_id))]
      const { data: accounts } = await adminDb
        .from('vapi_accounts')
        .select('id, api_key')
        .in('id', accountIds)
      const keyMap = new Map((accounts || []).map(a => [a.id, a.api_key]))

      const { VapiClient } = await import('@/lib/vapi/client')
      await Promise.allSettled(oldResources.map(async (r) => {
        const apiKey = keyMap.get(r.vapi_account_id)
        if (!apiKey) return
        try {
          const c = new VapiClient(apiKey)
          if (r.resource_type === 'phone_number') {
            await c.deletePhoneNumber(r.vapi_resource_id)
          } else if (r.resource_type === 'credential') {
            await c.deleteCredential(r.vapi_resource_id)
          }
        } catch (err) {
          console.warn('[SIP PUT] VAPI cleanup hatasi:', err instanceof Error ? err.message : err)
        }
      }))

      await adminDb
        .from('vapi_resources')
        .update({ is_active: false })
        .eq('local_resource_id', sipId)
        .eq('local_resource_type', 'sip')
    }

    // 3) Yeni ayarlarla 10 keye paralel re-provision
    try {
      const result = await VapiPoolManager.provisionSipTrunk(user.id, {
        sipId,
        name,
        ipAddress,
        port: Number(port),
        username,
        password,
        phoneNumber: e164Number,
      })

      return NextResponse.json({
        success: true,
        provisioning: {
          successful: result.successful,
          failed: result.failed,
          total: result.total,
          warnings: result.warnings,
        },
      })
    } catch (vapiError) {
      console.error('[SIP PUT] VAPI re-provision hatasi:', vapiError)
      return NextResponse.json({
        success: true,
        warning: 'DB guncellendi ama VAPI yenilenemedi - manuel resync gerekebilir',
        detail: vapiError instanceof Error ? vapiError.message : 'Bilinmeyen hata',
      })
    }
  } catch (error) {
    console.error('[SIP PUT] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// SIP Trunk sil + VAPI'den de temizle
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const adminDb = createAdminClient()

    // SIP'in bu kullanıcıya ait olduğunu kontrol et
    const { data: sip } = await adminDb
      .from('sips')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (!sip) {
      return NextResponse.json({ error: 'SIP trunk bulunamadı' }, { status: 404 })
    }

    // VAPI'deki kaynakları temizle
    const { data: resources } = await adminDb
      .from('vapi_resources')
      .select('*')
      .eq('local_resource_id', id)
      .eq('local_resource_type', 'sip')
      .eq('is_active', true)

    if (resources) {
      for (const resource of resources) {
        try {
          const { data: account } = await adminDb
            .from('vapi_accounts')
            .select('api_key')
            .eq('id', resource.vapi_account_id)
            .single()

          if (account) {
            const { VapiClient } = await import('@/lib/vapi/client')
            const client = new VapiClient(account.api_key)

            if (resource.resource_type === 'phone_number') {
              await client.deletePhoneNumber(resource.vapi_resource_id)
            } else if (resource.resource_type === 'credential') {
              await client.deleteCredential(resource.vapi_resource_id)
            }
          }
        } catch (err) {
          console.error(`[SIP API] VAPI cleanup hatası (${resource.resource_type}):`, err)
        }
      }

      // vapi_resources'ı deaktive et
      await adminDb
        .from('vapi_resources')
        .update({ is_active: false })
        .eq('local_resource_id', id)
        .eq('local_resource_type', 'sip')
    }

    // DB'den SIP'i sil
    await adminDb.from('sips').delete().eq('id', id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[SIP API] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
