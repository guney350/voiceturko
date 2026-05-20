/**
 * Onboarding durumu - kullanıcının kurulum adımları
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sb = createAdminClient()

    const [keysCount, sipsCount, asstCount, balance, callsCount] = await Promise.all([
      sb.from('user_pool_assignments').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
      sb.from('sips').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_active', true),
      sb.from('assistant').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      sb.from('user_balances').select('credit_try, package_minutes_remaining').eq('user_id', user.id).maybeSingle(),
      sb.from('calls').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ])

    const hasKeys = (keysCount.count || 0) > 0
    const hasSip = (sipsCount.count || 0) > 0
    const hasAssistant = (asstCount.count || 0) > 0
    const hasBalance = (balance.data?.credit_try || 0) > 0 || (balance.data?.package_minutes_remaining || 0) > 0
    const hasCall = (callsCount.count || 0) > 0

    const steps = [
      { id: 'keys', label: 'Sistem hatları tahsis edildi', completed: hasKeys, link: null },
      { id: 'balance', label: 'Bakiye/Paket hazır', completed: hasBalance, link: '/dashboard/packages' },
      { id: 'sip', label: 'SIP/Telefon bağlantısı eklendi', completed: hasSip, link: '/dashboard/sip' },
      { id: 'assistant', label: 'AI Asistan oluşturuldu', completed: hasAssistant, link: '/dashboard/assistant/new' },
      { id: 'call', label: 'İlk aramanız yapıldı', completed: hasCall, link: '/dashboard/campaigns/create' },
    ]

    const completed = steps.filter(s => s.completed).length
    const total = steps.length
    const progress = Math.round((completed / total) * 100)

    return NextResponse.json({
      success: true,
      steps,
      completed,
      total,
      progress,
      isComplete: completed === total,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
