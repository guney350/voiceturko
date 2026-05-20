import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VapiPoolManager } from '@/lib/vapi/pool-manager'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { assistantId } = await request.json()
    if (!assistantId) {
      return NextResponse.json({ error: 'Assistant ID gerekli' }, { status: 400 })
    }

    await VapiPoolManager.syncAssistant(user.id, assistantId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Assistant sync error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}