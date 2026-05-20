'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  MessageCircle, X, Send, Sparkles, Mail, RotateCw, Phone,
} from 'lucide-react'
import { toast } from 'sonner'
import { usePathname } from 'next/navigation'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  pending?: boolean
}

interface ChatbotSettings {
  name: string
  enabled: boolean
  welcome_message: string
  fallback_to_human: boolean
}

export function ChatWidget() {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [settings, setSettings] = useState<ChatbotSettings | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [showHandoff, setShowHandoff] = useState(false)
  const [handoffForm, setHandoffForm] = useState({ subject: '', message: '' })
  const [handoffSubmitting, setHandoffSubmitting] = useState(false)
  const [unread, setUnread] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Settings yükle
  useEffect(() => {
    fetch('/api/chat/settings')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.settings) {
          setSettings(d.settings)
          // İlk mesaj
          if (d.settings.welcome_message) {
            setMessages([{ role: 'assistant', content: d.settings.welcome_message }])
          }
        }
      })
      .catch(() => {})
  }, [])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Açılınca unread'i temizle
  useEffect(() => {
    if (isOpen) setUnread(false)
  }, [isOpen])

  const send = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || streaming) return

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const newMessages = [...messages, userMsg, { role: 'assistant' as const, content: '', pending: true }]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
          conversationId,
          currentPage: pathname,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Hata')
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n').filter(l => l.trim())

          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (data === '[DONE]') continue

            try {
              const parsed = JSON.parse(data)
              if (parsed.conversationId) {
                setConversationId(parsed.conversationId)
              }
              if (parsed.content) {
                assistantContent += parsed.content
                setMessages(prev => {
                  const next = [...prev]
                  next[next.length - 1] = {
                    role: 'assistant',
                    content: assistantContent,
                    pending: false,
                  }
                  return next
                })
              }
              if (parsed.error) {
                throw new Error(parsed.error)
              }
            } catch (parseErr) {
              if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
                console.error('parse error:', parseErr)
              }
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Hata'
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = {
          role: 'assistant',
          content: `❌ Hata: ${msg}`,
          pending: false,
        }
        return next
      })
      toast.error('Mesaj gönderilemedi: ' + msg)
    } finally {
      setStreaming(false)
    }
  }, [input, messages, conversationId, pathname, streaming])

  const resetChat = () => {
    setMessages(settings?.welcome_message ? [{ role: 'assistant', content: settings.welcome_message }] : [])
    setConversationId(null)
    toast.success('Sohbet sıfırlandı')
  }

  const handleHandoff = async () => {
    if (!handoffForm.subject.trim() || !handoffForm.message.trim()) {
      toast.error('Konu ve mesaj zorunlu')
      return
    }
    setHandoffSubmitting(true)
    try {
      const res = await fetch('/api/chat/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          subject: handoffForm.subject,
          message: handoffForm.message,
          contextPage: pathname,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(data.message || 'Talebiniz alındı, destek ekibi en kısa sürede dönüş yapacak.')
        setShowHandoff(false)
        setHandoffForm({ subject: '', message: '' })
        // Sohbete bilgi mesajı ekle
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✅ Canlı destek talebiniz alındı (Ticket: ${data.ticketId?.substring(0, 8) || '—'}). En kısa sürede ${data.emailSent ? 'email ile ' : ''}dönüş yapılacak.`,
        }])
      } else {
        toast.error(data.error || 'Talep gönderilemedi')
      }
    } catch {
      toast.error('Hata oluştu')
    } finally {
      setHandoffSubmitting(false)
    }
  }

  if (!settings?.enabled) return null

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 group flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-2xl hover:scale-105 transition-all"
          aria-label="Sohbet başlat"
        >
          <div className="relative">
            <MessageCircle className="w-5 h-5" />
            {unread && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
            )}
          </div>
          <span className="text-sm font-medium hidden group-hover:inline-block">Yardım</span>
        </button>
      )}

      {/* Chat Sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent className="flex flex-col p-0 sm:max-w-md" side="right">
          <SheetHeader className="px-4 py-3 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <SheetTitle className="text-base">{settings?.name || 'Asistan'}</SheetTitle>
                  <SheetDescription className="text-xs flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Çevrimiçi • Anında cevap
                  </SheetDescription>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={resetChat} title="Yeni sohbet" className="h-7 w-7">
                  <RotateCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((msg, i) => (
              <ChatMessageBubble key={i} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions */}
          {settings?.fallback_to_human && messages.length > 1 && (
            <div className="px-4 py-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowHandoff(true)}
              >
                <Phone className="w-3.5 h-3.5 mr-2" />
                Canlı Desteğe Bağlan
              </Button>
            </div>
          )}

          {/* Input */}
          <div className="border-t p-3">
            <form
              onSubmit={(e) => { e.preventDefault(); send() }}
              className="flex gap-2"
            >
              <Input
                placeholder="Sorunuzu yazın..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={streaming}
                className="flex-1"
              />
              <Button type="submit" disabled={streaming || !input.trim()} size="icon">
                <Send className="w-4 h-4" />
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground text-center mt-1">
              AI yanıtlar hata içerebilir, kritik konularda canlı destek alın
            </p>
          </div>
        </SheetContent>
      </Sheet>

      {/* Handoff Modal */}
      <Dialog open={showHandoff} onOpenChange={setShowHandoff}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              Canlı Destek Talebi
            </DialogTitle>
            <DialogDescription>
              Talebiniz destek ekibimize email ile iletilecek. En kısa sürede dönüş yapılacak.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Konu</Label>
              <Input
                placeholder="Örn: SIP ekleme hatası"
                value={handoffForm.subject}
                onChange={e => setHandoffForm({ ...handoffForm, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Mesajınız</Label>
              <Textarea
                placeholder="Sorununuzu detaylı anlatın..."
                rows={5}
                value={handoffForm.message}
                onChange={e => setHandoffForm({ ...handoffForm, message: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              ℹ️ Sohbet geçmişiniz otomatik olarak destek ekibine iletilir.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHandoff(false)}>İptal</Button>
            <Button onClick={handleHandoff} disabled={handoffSubmitting}>
              {handoffSubmitting ? 'Gönderiliyor...' : 'Talep Gönder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted rounded-bl-sm'
        }`}
      >
        {message.pending && message.content === '' ? (
          <div className="flex gap-1 items-center py-1">
            <span className="w-2 h-2 bg-current rounded-full animate-bounce opacity-50" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-current rounded-full animate-bounce opacity-50" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-current rounded-full animate-bounce opacity-50" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <MessageContent content={message.content} />
        )}
      </div>
    </div>
  )
}

function MessageContent({ content }: { content: string }) {
  // Basit markdown: **kalın**, kod, satır sonları, başlıklar
  const html = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code class="bg-background/50 px-1 py-0.5 rounded text-[12px]">$1</code>')
    .replace(/^### (.+)$/gm, '<div class="font-semibold text-sm mt-2 mb-1">$1</div>')
    .replace(/^- (.+)$/gm, '<div class="ml-3">• $1</div>')
    .replace(/\n/g, '<br>')

  return <div className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: html }} />
}
