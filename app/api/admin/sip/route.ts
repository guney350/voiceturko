/**
 * Admin SIP Management
 * SIP eklendiğinde kullanıcının 10 atanmış key'ine eager provision edilir.
 * Silindiğinde VAPI kaynakları da temizlenir.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { VapiPoolManager } from '@/lib/vapi/pool-manager'
import { VapiClient } from '@/lib/vapi/client'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function verifyAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === 'verified'
}

export async function POST(request: NextRequest) {
  try {
    if (!await verifyAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId, name, ipAddress, port, username, password, phoneNumber } = await request.json()

    if (!userId || !name || !ipAddress || !username || !password) {
      return NextResponse.json({ error: 'Eksik alan' }, { status: 400 })
    }

    const supabase = getAdminSupabase()
    const resolvedPhoneNumber = phoneNumber || `+90${username}`

    // 1. DB'ye kaydet
    const { data, error } = await supabase
      .from('sips')
      .insert({
        user_id: userId,
        name,
        ip_address: ipAddress,
        port: parseInt(port) || 5060,
        username,
        password,
        phone_number: resolvedPhoneNumber,
      })
      .select()
      .single()

    if (error) throw error

    // 2. 10 key'e eager provision et
    let provisioning = null
    try {
      provisioning = await VapiPoolManager.provisionSipTrunk(userId, {
        sipId: data.id,
        name,
        ipAddress,
        port: parseInt(port) || 5060,
        username,
        password,
        phoneNumber: resolvedPhoneNumber,
      })
    } catch (provisionErr) {
      console.error('VAPI SIP provision error:', provisionErr)
      const msg = provisionErr instanceof Error ? provisionErr.message : 'Provision failed'
      return NextResponse.json({
        success: true,
        data,
        warning: `SIP DB'ye eklendi ancak VAPI'ye provision başarısız: ${msg}`,
      })
    }

    return NextResponse.json({
      success: true,
      data,
      provisioning,
    })
  } catch (error) {
    console.error('SIP create error:', error)
    const msg = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!await verifyAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, name, ipAddress, port, username, password, phoneNumber } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })
    }

    const supabase = getAdminSupabase()

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (ipAddress !== undefined) updateData.ip_address = ipAddress
    if (port !== undefined) updateData.port = parseInt(port) || 5060
    if (username !== undefined) updateData.username = username
    if (password !== undefined) updateData.password = password
    if (phoneNumber !== undefined) updateData.phone_number = phoneNumber

    const { error } = await supabase
      .from('sips')
      .update(updateData)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('SIP update error:', error)
    const msg = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!await verifyAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const supabase = getAdminSupabase()

    // 1. SIP'e bağlı tüm VAPI kaynaklarını bul
    const { data: resources } = await supabase
      .from('vapi_resources')
      .select('id, vapi_account_id, vapi_resource_id, resource_type, vapi_accounts(api_key)')
      .eq('local_resource_id', id)
      .eq('local_resource_type', 'sip')
      .eq('is_active', true)

    let vapiDeleted = 0
    let vapiFailed = 0

    if (resources && resources.length > 0) {
      // 2. VAPI'den sil (önce phone_number'lar, sonra credential'lar)
      const sortedResources = [...resources].sort((a, b) => {
        if (a.resource_type === 'phone_number') return -1
        if (b.resource_type === 'phone_number') return 1
        return 0
      })

      for (const resource of sortedResources) {
        try {
          const acc = Array.isArray(resource.vapi_accounts)
            ? resource.vapi_accounts[0]
            : resource.vapi_accounts
          if (!acc?.api_key) continue

          const client = new VapiClient(acc.api_key)
          if (resource.resource_type === 'phone_number') {
            await client.deletePhoneNumber(resource.vapi_resource_id)
          } else if (resource.resource_type === 'credential') {
            await client.deleteCredential(resource.vapi_resource_id)
          }
          vapiDeleted++
        } catch (err) {
          console.error(`VAPI sil hatası (${resource.resource_type}):`, err)
          vapiFailed++
        }
      }

      // 3. vapi_resources'dan sil
      await supabase
        .from('vapi_resources')
        .delete()
        .eq('local_resource_id', id)
        .eq('local_resource_type', 'sip')
    }

    // 4. sips tablosundan sil
    const { error } = await supabase
      .from('sips')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({
      success: true,
      vapiDeleted,
      vapiFailed,
    })
  } catch (error) {
    console.error('SIP delete error:', error)
    const msg = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
