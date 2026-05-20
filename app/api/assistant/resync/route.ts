/**
 * Asistan VAPI Yeniden Senkronizasyon
 *
 * Tek asistanı veya tüm asistanları DB'deki güncel haliyle VAPI'ye yeniden gönderir.
 * Türkçe karakter bozulması düzeltildikten sonra VAPI'deki kopyaları yenilemek için.
 *
 * POST /api/assistant/resync           → tüm asistanları
 * POST /api/assistant/resync?id=...    → tek asistan
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VapiPoolManager } from '@/lib/vapi/pool-manager'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const singleId = searchParams.get('id')

    const adminDb = createAdminClient()

    // Asistanları çek
    const q = adminDb.from('assistant').select('id, name').eq('user_id', user.id)
    if (singleId) q.eq('id', singleId)

    const { data: assistants } = await q

    if (!assistants || assistants.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Senkronize edilecek asistan bulunamadı',
        synced: 0,
      })
    }

    const results: Array<{ id: string; name: string; success: boolean; error?: string; provisioned?: number }> = []

    // Paralel re-sync (her asistan kendi içinde 10 keye paralel push yapar)
    await Promise.all(
      assistants.map(async (a) => {
        try {
          const r = await VapiPoolManager.syncAssistant(user.id, a.id)
          const successful = (r as { successful?: number; total?: number }).successful || 0
          const total = (r as { successful?: number; total?: number }).total || 0
          results.push({ id: a.id, name: a.name, success: true, provisioned: successful })
          void total
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Bilinmeyen hata'
          results.push({ id: a.id, name: a.name, success: false, error: msg })
        }
      })
    )

    const okCount = results.filter(r => r.success).length
    const failCount = results.length - okCount

    return NextResponse.json({
      success: true,
      total: results.length,
      synced: okCount,
      failed: failCount,
      results,
      message: failCount === 0
        ? `${okCount} asistan VAPI'ye yeniden gönderildi`
        : `${okCount} başarılı, ${failCount} başarısız`,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Hata'
    console.error('[assistant/resync] error:', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
