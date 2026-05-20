/**
 * Chat → Canlı Destek Handoff
 * Kullanıcı "canlı destek istiyorum" derse:
 * 1. support_tickets'a kayıt oluştur
 * 2. Admin'e email gönder (Resend ile)
 * 3. Conversation status = 'escalated'
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { conversationId, subject, message, contextPage } = await request.json()

    if (!subject || !message) {
      return NextResponse.json({ error: 'Konu ve mesaj zorunlu' }, { status: 400 })
    }

    const adminDb = createAdminClient()

    // Chatbot settings'ten destek email'i al
    const { data: settings } = await adminDb
      .from('chatbot_settings')
      .select('support_email, name')
      .limit(1)
      .single()

    const supportEmail = settings?.support_email || process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL

    if (!supportEmail) {
      return NextResponse.json({
        error: 'Destek email tanımlanmamış. Admin chatbot ayarlarından eklemeli.',
      }, { status: 500 })
    }

    // Conversation history'i al (varsa)
    // OWNERSHIP CHECK: conversationId user'a ait olmali (IDOR koruma)
    let conversationHistory = ''
    let validatedConversationId: string | null = null
    if (conversationId) {
      const { data: conv } = await adminDb
        .from('chat_conversations')
        .select('id, user_id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (!conv) {
        return NextResponse.json({ error: 'Conversation bulunamadi veya yetki yok' }, { status: 403 })
      }
      validatedConversationId = conv.id

      const { data: messages } = await adminDb
        .from('chat_messages')
        .select('role, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(20)

      if (messages && messages.length > 0) {
        conversationHistory = messages
          .map(m => `**${m.role === 'user' ? 'Kullanıcı' : 'Asistan'}** (${new Date(m.created_at).toLocaleTimeString('tr-TR')}):\n${m.content}`)
          .join('\n\n---\n\n')
      }
    }

    // Ticket oluştur
    const { data: ticket } = await adminDb
      .from('support_tickets')
      .insert({
        user_id: user.id,
        user_email: user.email,
        conversation_id: validatedConversationId,
        subject,
        message,
        context_page: contextPage || null,
        context_data: {
          user_metadata: user.user_metadata,
          created_at: user.created_at,
        },
        status: 'open',
        priority: 'normal',
      })
      .select('id')
      .single()

    // Conversation'ı escalated yap (validated id ile)
    if (validatedConversationId) {
      await adminDb
        .from('chat_conversations')
        .update({ status: 'escalated' })
        .eq('id', validatedConversationId)
    }

    // Email gönder (Resend varsa)
    let emailSent = false
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'destek@voiceturko.com'

        await resend.emails.send({
          from: `${settings?.name || 'VoiceTurko'} <${fromEmail}>`,
          to: supportEmail,
          replyTo: user.email,
          subject: `[Destek] ${subject}`,
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 20px; color: white; border-radius: 8px 8px 0 0;">
                <h2 style="margin: 0;">📞 Yeni Canlı Destek Talebi</h2>
                <p style="margin: 5px 0 0; opacity: 0.9;">${new Date().toLocaleString('tr-TR')}</p>
              </div>

              <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                <h3 style="color: #6366f1; margin-top: 0;">${subject}</h3>

                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; width: 120px;"><strong>👤 Kullanıcı:</strong></td>
                    <td style="padding: 8px 0;">${user.email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280;"><strong>🆔 User ID:</strong></td>
                    <td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${user.id}</td>
                  </tr>
                  ${contextPage ? `<tr><td style="padding: 8px 0; color: #6b7280;"><strong>📍 Sayfa:</strong></td><td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${contextPage}</td></tr>` : ''}
                  ${ticket?.id ? `<tr><td style="padding: 8px 0; color: #6b7280;"><strong>🎫 Ticket:</strong></td><td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${ticket.id}</td></tr>` : ''}
                </table>

                <div style="margin: 20px 0; padding: 15px; background: #f3f4f6; border-left: 4px solid #6366f1; border-radius: 4px;">
                  <p style="margin: 0; white-space: pre-wrap;">${message}</p>
                </div>

                ${conversationHistory ? `
                  <h4 style="color: #6b7280; margin-top: 25px;">💬 Sohbet Geçmişi</h4>
                  <div style="background: #fafafa; padding: 15px; border-radius: 4px; font-size: 13px;">
                    ${conversationHistory.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}
                  </div>
                ` : ''}

                <p style="margin-top: 20px; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                  Bu kullanıcıya cevap vermek için bu maile yanıt verebilirsiniz (Reply-To: ${user.email})
                </p>
              </div>
            </div>
          `,
        })

        emailSent = true

        // Ticket'ı güncelle
        if (ticket?.id) {
          await adminDb
            .from('support_tickets')
            .update({
              email_sent: true,
              email_sent_at: new Date().toISOString(),
            })
            .eq('id', ticket.id)
        }
      } catch (emailErr) {
        console.error('[chat handoff] email error:', emailErr)
      }
    } else {
      console.warn('[chat handoff] RESEND_API_KEY tanımlı değil, email gönderilemiyor')
    }

    return NextResponse.json({
      success: true,
      ticketId: ticket?.id,
      emailSent,
      message: emailSent
        ? `Destek talebiniz alındı. ${supportEmail} adresine mail gönderildi, en kısa sürede dönüş yapılacak.`
        : 'Destek talebiniz oluşturuldu, en kısa sürede dönüş yapılacak.',
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown'
    console.error('[chat handoff] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
