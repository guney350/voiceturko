import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ORIGINS = [
  'https://voiceturko.com',
  'http://voiceturko.com',
  'https://www.voiceturko.com',
  'http://www.voiceturko.com',
  'http://95.217.132.75',
]

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

const SYSTEM_PROMPT = `# VoiceTurko - AI Çağrı Platformu Destek Asistanı

Sen VoiceTurko'nun web sitesi destek asistanısın. Ziyaretçilere platform hakkında bilgi veriyorsun.

## Platform Hakkında
VoiceTurko, işletmelerin AI sesli asistanlarla otomatik telefon görüşmeleri yapabildiği bir platformdur.

## Temel Özellikler
- AI Asistanlar: Türkçe konuşan, doğal sesli yapay zeka asistanları
- Toplu Arama Kampanyaları: Excel/CSV ile müşteri listesi yükleyip otomatik arama
- Gelen Arama Karşılama: 7/24 AI ile müşteri aramalarını karşılama
- SIP Bağlantısı: Kendi telefon hattınızı bağlama
- Gerçek Zamanlı İzleme: Aramaları canlı takip etme
- Raporlama: Detaylı arama raporları ve analizler

## Fiyatlandırma
- Ücretsiz: 500 TL hoşgeldin kredisi, 10 TL/dakika
- Başlangıç: 10.000 dakika @ 7 TL/dk = 70.000 TL
- Popüler: 30.000 dakika @ 5 TL/dk = 150.000 TL
- Profesyonel: 50.000 dakika @ 4 TL/dk = 200.000 TL

## Kayıt
Hemen app.voiceturko.com/login adresinden ücretsiz hesap oluşturabilirsiniz. 500 TL hoşgeldin kredisi otomatik tanımlanır.

## Kurallar
1. Türkçe cevap ver, samimi ve profesyonel ol
2. Kısa ve net ol
3. Ziyaretçileri kayıt olmaya teşvik et
4. Fiyat ve özellik bilgilerinde kesin ol
5. Bilmediğin konularda info@voiceturko.com'a yönlendir`

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  const corsHeaders = getCorsHeaders(origin)

  try {
    const body = await request.json()
    const messages = body.messages || []

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Mesaj yok' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (messages.length > 10) {
      return new Response(JSON.stringify({ error: 'Çok fazla mesaj' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const adminDb = createAdminClient()
    const { data: settings } = await adminDb
      .from('chatbot_settings')
      .select('*')
      .limit(1)
      .single()

    if (!settings?.enabled) {
      return new Response(JSON.stringify({ error: 'Chatbot kapalı' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key eksik' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const stream = await openai.chat.completions.create({
      model: settings.model || 'gpt-4o-mini',
      temperature: parseFloat(settings.temperature) || 0.7,
      max_tokens: settings.max_tokens || 800,
      stream: true,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
    })

    const encoder = new TextEncoder()
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
              )
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          console.error('[public chat stream] error:', err)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: 'Stream hatası' })}\n\n`)
          )
          controller.close()
        }
      },
    })

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        ...corsHeaders,
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('[public chat API] error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return new Response(null, {
    headers: getCorsHeaders(origin),
  })
}
