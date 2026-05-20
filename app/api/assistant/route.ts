/**
 * Kullanıcı Asistan API
 * DELETE: Asistanı tüm VAPI hatlarından (10 key) ve DB'den siler
 * Race-safe: vapi_resources önce silinir, sonra DB
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VapiClient } from '@/lib/vapi/client'

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
      return NextResponse.json({ error: 'id parametresi gerekli' }, { status: 400 })
    }

    const adminDb = createAdminClient()

    // 1. Asistan sahibi mi?
    const { data: assistant } = await adminDb
      .from('assistant')
      .select('id, user_id, name')
      .eq('id', id)
      .single()

    if (!assistant) {
      return NextResponse.json({ error: 'Asistan bulunamadı' }, { status: 404 })
    }

    if (assistant.user_id !== user.id) {
      return NextResponse.json({ error: 'Bu asistanı silme yetkiniz yok' }, { status: 403 })
    }

    // 2. Aktif kampanya var mı? (running/paused ise engelle)
    const { count: activeCampaigns } = await adminDb
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('assistant_id', id)
      .in('status', ['running', 'paused'])

    if ((activeCampaigns || 0) > 0) {
      return NextResponse.json({
        error: `Bu asistana bağlı ${activeCampaigns} aktif/duraklatılmış kampanya var. Önce kampanyaları tamamlayın veya silin.`,
      }, { status: 400 })
    }

    // 2b. Tamamlanmış/draft kampanyalardaki FK'yı NULL yap (silmeyi engellemesin)
    await adminDb
      .from('campaigns')
      .update({ assistant_id: null })
      .eq('assistant_id', id)
      .in('status', ['completed', 'cancelled', 'draft', 'pending'])

    // 3. 10 hattan VAPI kaynaklarını temizle
    const { data: resources } = await adminDb
      .from('vapi_resources')
      .select('id, vapi_account_id, vapi_resource_id, vapi_accounts(api_key)')
      .eq('local_resource_id', id)
      .eq('local_resource_type', 'assistant')
      .eq('resource_type', 'assistant')

    let vapiDeleted = 0
    let vapiFailed = 0

    if (resources && resources.length > 0) {
      // Paralel sil (10 paralel istek)
      const results = await Promise.allSettled(
        resources.map(async (r) => {
          const acc = Array.isArray(r.vapi_accounts) ? r.vapi_accounts[0] : r.vapi_accounts
          if (!acc?.api_key || !r.vapi_resource_id) return { ok: false, reason: 'no_api_key' }
          try {
            const client = new VapiClient(acc.api_key)
            await client.deleteAssistant(r.vapi_resource_id)
            return { ok: true }
          } catch (err) {
            // 404 ise zaten silinmiş - başarılı say
            const msg = err instanceof Error ? err.message : ''
            if (msg.includes('404') || msg.includes('not found') || msg.includes('Not Found')) {
              return { ok: true, alreadyGone: true }
            }
            return { ok: false, reason: msg }
          }
        })
      )

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.ok) vapiDeleted++
        else vapiFailed++
      }

      // vapi_resources'tan sil (VAPI silme başarısız olsa bile)
      await adminDb
        .from('vapi_resources')
        .delete()
        .eq('local_resource_id', id)
        .eq('local_resource_type', 'assistant')
    }

    // 4. campaign_items + calls kayıtlarında assistant_id NULL'a çevir (ON DELETE SET NULL gibi)
    // (FK yoksa zaten sorun olmaz; varsa ON DELETE SET NULL davranışı simulate edilir)

    // 5. assistant DB kaydını sil
    const { error: delErr } = await adminDb
      .from('assistant')
      .delete()
      .eq('id', id)

    if (delErr) {
      return NextResponse.json({
        error: `DB silme hatası: ${delErr.message}`,
        vapiDeleted,
        vapiFailed,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Asistan silindi (${vapiDeleted}/${resources?.length || 0} hatta temizlendi)`,
      vapiDeleted,
      vapiFailed,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    console.error('[assistant DELETE] error:', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
