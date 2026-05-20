/**
 * Chatbot ayarlarını getir (public - sadece widget için gerekli alanlar)
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const sb = createAdminClient()
    const { data } = await sb
      .from('chatbot_settings')
      .select('name, avatar_url, enabled, welcome_message, fallback_to_human')
      .limit(1)
      .single()

    return NextResponse.json({ success: true, settings: data || null })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
