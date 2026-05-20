/**
 * Sektörleri listele (auth gerekli)
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminDb = createAdminClient()
    const { data: industries } = await adminDb
      .from('industries')
      .select('*')
      .eq('is_active', true)
      .order('display_order')

    // Her industry için template sayısını ekle
    const enriched = await Promise.all((industries || []).map(async (ind) => {
      const { count } = await adminDb
        .from('assistant_templates')
        .select('id', { count: 'exact', head: true })
        .eq('industry_id', ind.id)
        .eq('is_active', true)
      return { ...ind, template_count: count || 0 }
    }))

    return NextResponse.json({ success: true, industries: enriched })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
