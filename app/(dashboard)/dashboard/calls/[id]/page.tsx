import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VapiClient } from '@/lib/vapi/client'
import { completeCall } from '@/lib/vapi/call-lifecycle'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, ArrowLeft, Clock, CalendarDays, BrainCircuit, Headphones, Sparkles, DollarSign, User } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let { data: call } = await supabase
    .from('calls')
    .select('*')
    .eq('id', id)
    .eq('user_id', user?.id)
    .single()

  if (!call) {
    notFound()
  }

  // OTOMATIK FETCH: Eger transcript/summary bos VE arama bittiyse, VAPI'den anlik cek
  // Bu, webhook'lar gelmese veya gecikse bile bilgilerin gorunmesini saglar
  if (call.vapi_call_id && (!call.transcript || !call.summary)) {
    try {
      const adminDb = createAdminClient()
      // vapi_account_id yoksa kullanicinin keylerinden buldur
      let accountId = call.vapi_account_id as string | null
      let apiKey: string | null = null

      if (accountId) {
        const { data: acc } = await adminDb
          .from('vapi_accounts')
          .select('api_key')
          .eq('id', accountId)
          .single()
        apiKey = acc?.api_key || null
      }

      if (!apiKey) {
        const { data: userKeys } = await adminDb
          .from('user_pool_assignments')
          .select('vapi_accounts!inner(id, api_key, is_active)')
          .eq('user_id', user?.id)
          .eq('is_active', true)
        const accounts = (userKeys || [])
          .map(uk => Array.isArray(uk.vapi_accounts) ? uk.vapi_accounts[0] : uk.vapi_accounts)
          .filter(a => a && a.is_active) as Array<{ id: string; api_key: string }>
        for (const acc of accounts) {
          try {
            const c = new VapiClient(acc.api_key)
            const vc = await c.getCall(call.vapi_call_id as string)
            if (vc?.id) {
              apiKey = acc.api_key
              accountId = acc.id
              await adminDb.from('calls').update({ vapi_account_id: acc.id }).eq('id', call.id)
              break
            }
          } catch {}
        }
      }

      if (apiKey) {
        const client = new VapiClient(apiKey)
        const vapiCall = await client.getCall(call.vapi_call_id as string)
        const isFinished = vapiCall.endedAt || vapiCall.status === 'ended' || vapiCall.status === 'completed' || vapiCall.status === 'failed'
        if (isFinished) {
          await completeCall({
            vapiCallId: vapiCall.id,
            source: 'polling',
            callPayload: vapiCall,
            artifact: vapiCall.artifact,
            endedReason: vapiCall.endedReason,
            analysis: vapiCall.analysis,
          })

          // Force fill: completeCall skip etse bile transcript/summary'i guncelle
          const transcript = (vapiCall.artifact as Record<string, unknown>)?.transcript as string | undefined
          const summary = (vapiCall.analysis as Record<string, unknown>)?.summary as string | undefined
          const successEval = (vapiCall.analysis as Record<string, unknown>)?.successEvaluation as string | undefined
          const recordingUrl = ((vapiCall.artifact as Record<string, unknown>)?.recordingUrl as string) || ''
          const updatePayload: Record<string, unknown> = {}
          if (transcript && !call.transcript) updatePayload.transcript = transcript
          if (summary && !call.summary) {
            updatePayload.summary = summary
            updatePayload.analysis = successEval ? `Değerlendirme: ${successEval}\n\nÖzet: ${summary}` : summary
          }
          if (recordingUrl && !call.recording_url) {
            updatePayload.recording_url = recordingUrl
            updatePayload.audio = recordingUrl
          }
          if (Object.keys(updatePayload).length > 0) {
            await adminDb.from('calls').update(updatePayload).eq('id', call.id)
            // Tazele
            const refreshed = await adminDb.from('calls').select('*').eq('id', call.id).single()
            if (refreshed.data) call = refreshed.data
          }
        }
      }
    } catch (err) {
      console.error('[call-detail] auto-fetch hatasi:', err)
    }
  }

  const recordingUrl = call.audio || call.recording_url
  
  // Format Transcript as array of lines
  const transcriptLines = call.transcript ? call.transcript.split('\n').filter((l: string) => l.trim().length > 0) : []

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/calls">
            <Button variant="outline" size="icon" className="rounded-full shadow-sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Çağrı Raporu</h1>
              <Badge variant={recordingUrl ? 'default' : 'secondary'} className="rounded-full px-3">
                {recordingUrl ? 'Kayıt Var' : 'Kayıt Yok'}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
              <span className="font-mono text-xs opacity-70">ID: {call.id.split('-')[0]}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Audio Player Banner */}
      {recordingUrl && (
        <Card className="border-primary/20 bg-primary/5 shadow-none overflow-hidden">
          <div className="flex flex-col md:flex-row items-center gap-4 p-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="bg-primary/20 p-3 rounded-xl text-primary shrink-0 transition-transform hover:scale-105">
                <Headphones className="w-6 h-6" />
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium">Görüşme Kaydı</p>
                <p className="text-xs text-muted-foreground">Ses dosyasını dinleyin veya indirin</p>
              </div>
            </div>
            
            <div className="flex-1 w-full relative">
              <audio 
                controls 
                className="w-full h-11 outline-none opacity-90 transition-opacity hover:opacity-100" 
                style={{ colorScheme: 'dark' }} 
                src={recordingUrl} 
                preload="metadata" 
              />
            </div>
            
            <a href={recordingUrl} target="_blank" rel="noreferrer" download className="w-full md:w-auto">
              <Button variant="secondary" className="w-full md:w-auto rounded-full gap-2 shadow-sm border border-border/50">
                <Download className="w-4 h-4" />
                <span className="md:hidden lg:inline">Ses Dosyasını İndir</span>
              </Button>
            </a>
          </div>
        </Card>
      )}

      {/* Müşteri & Durum */}
      {(call.customer_name || call.customer_number) && (
        <Card className="border-muted/60 shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="bg-blue-500/10 p-3 rounded-lg">
              <User className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{call.customer_name || 'Bilinmiyor'}</p>
              <p className="text-sm text-muted-foreground">{call.customer_number || ''}</p>
            </div>
            {call.ended_reason && (
              <Badge variant="outline" className="text-xs">{call.ended_reason}</Badge>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-4">
        <Card className="md:col-span-1 border-muted/60 shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Tarih & Saat
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-lg">{new Date(call.created_at).toLocaleDateString('tr-TR')}</p>
            <p className="text-sm text-muted-foreground">{new Date(call.created_at).toLocaleTimeString('tr-TR')}</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 border-muted/60 shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Görüşme Süresi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <p className="font-semibold text-2xl">{call.duration_seconds || Math.round((call.duration_minutes || 0) * 60)}</p>
              <p className="text-sm text-muted-foreground">saniye</p>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 border-muted/60 shadow-sm bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Kullanım
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-2xl">
              {(call.duration_minutes || 0).toFixed(2)}
              <span className="text-sm font-normal text-muted-foreground ml-1">dk</span>
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">Bakiyenizden düşüldü</p>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 border-primary/20 shadow-sm bg-gradient-to-br from-primary/5 to-transparent relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <BrainCircuit className="w-16 h-16" />
          </div>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-primary flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI Analizi
            </CardTitle>
          </CardHeader>
          <CardContent>
            {call.summary || call.analysis ? (
              <p className="text-xs leading-relaxed text-foreground/90">
                {(call.summary || call.analysis || '').substring(0, 200)}{(call.summary || call.analysis || '').length > 200 ? '...' : ''}
              </p>
            ) : call.transcript ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground italic">Bu arama özetlenmemiş</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Asistan oluşturulurken &quot;Özet Kişiliği&quot; aktif değildi. Asistan Ayarları → &quot;Tümünü Yenile&quot; butonuna basın ve yeni bir arama yapın; otomatik Türkçe özet üretilecek.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Analiz yok</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-muted/60 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b">
          <CardTitle className="text-lg">Döküm (Transkript)</CardTitle>
          <CardDescription>Görüşmenin kelimesi kelimesine kaydı</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {transcriptLines.length > 0 ? (
            <div className="flex flex-col gap-4 p-6 bg-card/30">
              {transcriptLines.map((line: string, i: number) => {
                const isUser = line.toLowerCase().startsWith('user');
                const text = line.replace(/^(User|AI|Bot)\s*:\s*/i, '');
                
                return (
                  <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                      isUser 
                        ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                        : 'bg-muted text-foreground border border-border/50 rounded-tl-sm'
                    }`}>
                      <span className="block text-[10px] opacity-70 mb-1 uppercase tracking-wider font-semibold">
                        {isUser ? 'Müşteri' : 'Yapay Zeka (Asistan)'}
                      </span>
                      <p className="leading-relaxed">{text}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              Transkript kaydı oluşturulmamış.
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}