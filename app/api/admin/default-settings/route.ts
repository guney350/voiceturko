import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const adminSession = cookieStore.get('admin_session')?.value
    
    if (adminSession !== 'verified') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { data, error } = await supabase
      .from('default_assistant_settings')
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Default settings fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const adminSession = cookieStore.get('admin_session')?.value
    
    if (adminSession !== 'verified') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { aiProvider, aiModel, elevenlabsVoiceId, elevenlabsModel } = await request.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { error } = await supabase
      .from('default_assistant_settings')
      .update({
        ai_provider: aiProvider || 'openai',
        ai_model: aiModel,
        elevenlabs_voice_id: elevenlabsVoiceId,
        elevenlabs_model: elevenlabsModel
      })
      .eq('id', 'a0000000-0000-0000-0000-000000000001')

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Default settings update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
