/**
 * Toplu arama silme
 * POST { ids: string[] } - kullanıcının kendi aramalarını siler
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

      const { ids } = await request.json()
      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'ids array zorunlu' }, { status: 400 })
      }
      // DoS koruma: tek istekte max 500 silme
      if (ids.length > 500) {
        return NextResponse.json({ error: 'Tek seferde maksimum 500 arama silinebilir' }, { status: 413 })
      }

    const adminDb = createAdminClient()

    // Sadece kullanıcının kendi aramalarını sil (security)
    const { error, count } = await adminDb
      .from('calls')
      .delete({ count: 'exact' })
      .in('id', ids)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: count || 0 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Bilinmeyen hata'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
