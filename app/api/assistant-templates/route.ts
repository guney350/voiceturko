/**
 * Aktif şablonları listele (public, auth gerekli)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const industryId = url.searchParams.get('industry_id')

    const adminDb = createAdminClient()
    let query = adminDb
      .from('assistant_templates')
      .select('*')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('display_order', { ascending: true })

    if (industryId) query = query.eq('industry_id', industryId)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ success: true, templates: data || [] })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
