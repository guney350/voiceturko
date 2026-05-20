/**
 * Chatbot API - Streaming OpenAI responses
 * POST /api/chat
 *
 * Body: { messages: ChatMessage[], conversationId?: string, currentPage?: string }
 */

import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSystemPrompt } from '@/lib/chatbot/system-context'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const body = await request.json()
    const messages: ChatMessage[] = body.messages || []
    const currentPage: string | null = body.currentPage || null
    let conversationId: string | null = body.conversationId || null

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Mesaj yok' }), { status: 400 })
    }

    const adminDb = createAdminClient()

    // Settings'i al
    const { data: settings } = await adminDb.from('chatbot_settings').select('*').limit(1).single()
    if (!settings) {
      return new Response(JSON.stringify({ error: 'Chatbot ayarlanmamış' }), { status: 500 })
    }
    if (!settings.enabled) {
      return new Response(JSON.stringify({ error: 'Chatbot şu an kapalı' }), { status: 503 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenAI API key tanımlı değil' }), { status: 500 })
    }

    // Conversation olustur veya devam et (OWNERSHIP CHECK)
    if (conversationId) {
      const { data: conv } = await adminDb
        .from('chat_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!conv) {
        // Baska kullaniciya ait veya silinmis - yenisini olustur
        conversationId = null
      }
    }
    if (!conversationId) {
      const { data: newConv } = await adminDb
        .from('chat_conversations')
        .insert({
          user_id: user.id,
          title: messages[0]?.content.substring(0, 100) || 'Yeni sohbet',
          context_page: currentPage,
          status: 'active',
        })
        .select('id')
        .single()
      conversationId = newConv?.id || null
    }

    // Son user mesajını DB'ye kaydet
    if (conversationId) {
      const lastUserMsg = messages[messages.length - 1]
      if (lastUserMsg?.role === 'user') {
        await adminDb.from('chat_messages').insert({
          conversation_id: conversationId,
          role: 'user',
          content: lastUserMsg.content,
        })
      }
    }

    // System prompt oluştur
    const systemPrompt = await buildSystemPrompt(user.id, currentPage, settings.personality)

    // OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const stream = await openai.chat.completions.create({
      model: settings.model || 'gpt-4o-mini',
      temperature: parseFloat(settings.temperature) || 0.7,
      max_tokens: settings.max_tokens || 1000,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    })

    // Streaming response
    const encoder = new TextEncoder()
    let fullResponse = ''

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          // İlk olarak conversationId'yi gönder
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ conversationId })}\n\n`)
          )

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
              fullResponse += content
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
              )
            }
          }

          // Tamamlandı - assistant mesajını DB'ye kaydet
          if (conversationId && fullResponse) {
            await adminDb.from('chat_messages').insert({
              conversation_id: conversationId,
              role: 'assistant',
              content: fullResponse,
              model: settings.model,
            })

            // Conversation güncelle
            await adminDb
              .from('chat_conversations')
              .update({
                message_count: messages.length + 1,
                last_message_at: new Date().toISOString(),
              })
              .eq('id', conversationId)
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          console.error('[chat stream] error:', err)
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
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('[chat API] error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
