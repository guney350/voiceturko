import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VapiClient } from '@/lib/vapi/client'
import { completeCall } from '@/lib/vapi/call-lifecycle'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Users, Phone, CheckCircle, XCircle, Clock, AlertCircle, Zap, ExternalLink, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CampaignActions } from './campaign-actions'
import { CampaignPoller } from './campaign-poller'

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return '-'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function CampaignDetailSkeleton() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-10 w-20" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    </>
  )
}

async function CampaignDetailContent({ campaignId }: { campaignId: string }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Kampanya bilgilerini al
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('user_id', user?.id)
    .single()

  if (!campaign) {
    redirect('/dashboard/campaigns')
  }

  // Kampanya item'larını al (vapi_call_id ile calls tablosundaki id'yi de bağla)
  const { data: contacts } = await supabase
    .from('campaign_items')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('call_order', { ascending: true })

  // Calls tablosundaki id'leri eşleştir (Detay link'i için)
  const adminSupabase = createAdminClient()
  const callIds = (contacts || [])
    .filter(c => c.vapi_call_id)
    .map(c => c.vapi_call_id) as string[]

  // OTO-FETCH: Eksik calls kayıtlarını veya transcript'i VAPI'den anlık çek
  // Sayfa yüklendiğinde, eksik veri varsa background'da sync-all benzeri işlem yap
  if (callIds.length > 0) {
    const { data: existingCalls } = await adminSupabase
      .from('calls')
      .select('id, vapi_call_id, vapi_account_id, transcript, summary, user_id')
      .in('vapi_call_id', callIds)
      .eq('user_id', user?.id)

    const existingMap = new Map((existingCalls || []).map(c => [c.vapi_call_id, c]))
    const missingOrEmpty: Array<{ vapi_call_id: string; account_id: string | null; item: any }> = []

    for (const c of (contacts || [])) {
      if (!c.vapi_call_id) continue
      const existing = existingMap.get(c.vapi_call_id)
      if (!existing) {
        missingOrEmpty.push({ vapi_call_id: c.vapi_call_id, account_id: c.vapi_account_id, item: c })
      } else if (!existing.transcript || !existing.summary) {
        missingOrEmpty.push({ vapi_call_id: c.vapi_call_id, account_id: c.vapi_account_id || existing.vapi_account_id, item: c })
      }
    }

    if (missingOrEmpty.length > 0 && missingOrEmpty.length <= 30) {
      // Kullanıcının keylerini cache'le
      const { data: userKeys } = await adminSupabase
        .from('user_pool_assignments')
        .select('vapi_accounts!inner(id, api_key, is_active)')
        .eq('user_id', user?.id)
        .eq('is_active', true)
      const accounts = (userKeys || [])
        .map(uk => Array.isArray(uk.vapi_accounts) ? uk.vapi_accounts[0] : uk.vapi_accounts)
        .filter((a): a is { id: string; api_key: string; is_active: boolean } => !!a && (a as any).is_active)
      const apiKeyMap = new Map(accounts.map(a => [a.id, a.api_key]))

      await Promise.allSettled(
        missingOrEmpty.map(async (m) => {
          try {
            let apiKey = m.account_id ? apiKeyMap.get(m.account_id) : null
            let accountId = m.account_id
            if (!apiKey) {
              for (const acc of accounts) {
                try {
                  const c = new VapiClient(acc.api_key)
                  const test = await c.getCall(m.vapi_call_id)
                  if (test?.id) { apiKey = acc.api_key; accountId = acc.id; break }
                } catch {}
              }
            }
            if (!apiKey) return

            const client = new VapiClient(apiKey)
            const vapiCall = await client.getCall(m.vapi_call_id)
            if (!vapiCall?.id) return

            const isFinished = vapiCall.endedAt || vapiCall.status === 'ended' || vapiCall.status === 'completed' || vapiCall.status === 'failed'

            // 1) Orphan ise calls'a ekle (NOT NULL kolonlar icin defaultlar ile)
            const existing = existingMap.get(m.vapi_call_id)
            if (!existing) {
              await adminSupabase.from('calls').insert({
                user_id: user?.id,
                vapi_call_id: m.vapi_call_id,
                vapi_account_id: accountId,
                campaign_item_id: m.item.id,
                customer_name: m.item.customer_name,
                customer_number: m.item.customer_phone,
                call_type: 'outboundPhoneCall',
                status: isFinished ? 'ended' : (vapiCall.status || 'queued'),
                assistant_id: campaign.assistant_id,
                duration_minutes: 0,
                duration_seconds: 0,
                audio: '',
              }).then(() => {}, () => {})
            }

            // 2) completeCall (idempotent)
            if (isFinished) {
              await completeCall({
                vapiCallId: vapiCall.id,
                source: 'polling',
                callPayload: vapiCall,
                artifact: vapiCall.artifact,
                endedReason: vapiCall.endedReason,
                analysis: vapiCall.analysis,
              })

              // 3) Transcript/summary force fill
              const transcript = (vapiCall.artifact as Record<string, unknown>)?.transcript as string | undefined
              const summary = (vapiCall.analysis as Record<string, unknown>)?.summary as string | undefined
              const successEval = (vapiCall.analysis as Record<string, unknown>)?.successEvaluation as string | undefined
              const recordingUrl = ((vapiCall.artifact as Record<string, unknown>)?.recordingUrl as string) || ''
              const updatePayload: Record<string, unknown> = {}
              if (transcript) updatePayload.transcript = transcript
              if (summary) {
                updatePayload.summary = summary
                updatePayload.analysis = successEval ? `Değerlendirme: ${successEval}\n\nÖzet: ${summary}` : summary
              }
              if (recordingUrl) { updatePayload.recording_url = recordingUrl; updatePayload.audio = recordingUrl }
              if (Object.keys(updatePayload).length > 0) {
                await adminSupabase.from('calls').update(updatePayload).eq('vapi_call_id', m.vapi_call_id).then(() => {}, () => {})
              }
            }
          } catch {}
        })
      )
    }
  }

  const callsMap = new Map<string, string>()
  if (callIds.length > 0) {
    const { data: callsRecords } = await adminSupabase
      .from('calls')
      .select('id, vapi_call_id')
      .in('vapi_call_id', callIds)

    for (const c of (callsRecords || [])) {
      if (c.vapi_call_id && c.id) {
        callsMap.set(c.vapi_call_id, c.id)
      }
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', label: string }> = {
      draft: { variant: 'secondary', label: 'Taslak' },
      pending: { variant: 'secondary', label: 'Bekliyor' },
      active: { variant: 'default', label: 'Aktif' },
      running: { variant: 'default', label: 'Çalışıyor' },
      paused: { variant: 'outline', label: 'Duraklatıldı' },
      completed: { variant: 'outline', label: 'Tamamlandı' },
      cancelled: { variant: 'destructive', label: 'İptal Edildi' },
    }
    const config = variants[status] || variants.pending
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  const getCallStatusBadge = (status: string) => {
    const config: Record<string, { icon: any, label: string, className: string }> = {
      pending: { icon: Clock, label: 'Bekliyor', className: 'text-gray-500' },
      locked: { icon: Clock, label: 'Kilitli', className: 'text-yellow-500' },
      calling: { icon: Phone, label: 'Arıyor', className: 'text-blue-500' },
      completed: { icon: CheckCircle, label: 'Tamamlandı', className: 'text-green-500' },
      failed: { icon: XCircle, label: 'Başarısız', className: 'text-red-500' },
      cancelled: { icon: AlertCircle, label: 'İptal', className: 'text-orange-500' },
      retry_wait: { icon: Clock, label: 'Tekrar Bekliyor', className: 'text-yellow-500' },
    }
    const item = config[status] || config.pending
    const Icon = item.icon
    return (
      <div className={`flex items-center gap-2 ${item.className}`}>
        <Icon className="h-4 w-4" />
        <span className="text-sm">{item.label}</span>
      </div>
    )
  }

  const successRate = campaign.completed_calls > 0
    ? ((campaign.successful_calls / campaign.completed_calls) * 100).toFixed(1)
    : '0'

  const pendingContacts = contacts?.filter(c => c.status === 'pending').length || 0
  const callingContacts = contacts?.filter(c => c.status === 'calling').length || 0
  const retryingContacts = contacts?.filter(c => c.status === 'retry_wait').length || 0
  const completedContacts = contacts?.filter(c => c.status === 'completed').length || 0
  const failedContacts = contacts?.filter(c => ['failed', 'cancelled'].includes(c.status)).length || 0

  // Aktif arama veya bekleyen item varsa poller çalışmalı
  const hasActiveCalls = (contacts || []).some(c =>
    ['calling', 'locked', 'pending', 'retry_wait'].includes(c.status as string)
  )

  return (
    <>
      <CampaignPoller
        campaignId={campaign.id}
        isRunning={campaign.status === 'running'}
        hasActiveCalls={hasActiveCalls}
      />
      <div className="px-4 lg:px-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/campaigns">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Geri
              </Button>
            </Link>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
                {getStatusBadge(campaign.status)}
              </div>
              <p className="text-muted-foreground">
                Asistan ID: {campaign.assistant_id || '-'}
              </p>
            </div>
          </div>
          <CampaignActions campaignId={campaign.id} status={campaign.status} />
        </div>
      </div>

      <div className="px-4 lg:px-6 space-y-6">
        {/* Duraklama nedeni uyarısı */}
        {campaign.status === 'paused' && campaign.pause_reason && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-900 dark:text-yellow-100">Kampanya duraklatıldı</p>
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Sebep: {campaign.pause_reason === 'stale_heartbeat' ? 'Bağlantı kesildi (sayfa kapatılmış olabilir)' : campaign.pause_reason}
                </p>
                {campaign.last_error_detail && (
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1 font-mono">
                    {campaign.last_error_detail}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* İstatistik Kartları */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Toplam Kişi</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaign.total_contacts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Eşzamanlı Arama</CardTitle>
              <Zap className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaign.max_concurrent_calls || 1}</div>
              <p className="text-xs text-muted-foreground">
                {(campaign.max_concurrent_calls || 1) === 1 ? 'Sıralı arama' : 'aynı anda'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tamamlanan</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaign.completed_calls}</div>
              <p className="text-xs text-muted-foreground">
                {campaign.total_contacts > 0 ? ((campaign.completed_calls / campaign.total_contacts) * 100).toFixed(0) : 0}% tamamlandı
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Başarılı</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{campaign.successful_calls}</div>
              <p className="text-xs text-muted-foreground">
                Başarı oranı: {successRate}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Başarısız</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{campaign.failed_calls}</div>
              <p className="text-xs text-muted-foreground">
                Toplam başarısız arama
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Kişi Listesi */}
        <Card>
          <CardHeader>
            <CardTitle>Kampanya Kişileri</CardTitle>
            <CardDescription>
              Kampanyaya dahil edilen tüm kişiler ve arama durumları
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="all">
                  Tümü ({contacts?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="pending">
                  Bekliyor ({pendingContacts})
                </TabsTrigger>
                <TabsTrigger value="calling">
                  Arıyor ({callingContacts})
                </TabsTrigger>
                <TabsTrigger value="retry">
                  Yeniden ({retryingContacts})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Tamamlandı ({completedContacts})
                </TabsTrigger>
                <TabsTrigger value="failed">
                  Başarısız ({failedContacts})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-4">
                <ContactsTable contacts={contacts || []} getCallStatusBadge={getCallStatusBadge} callsMap={callsMap} />
              </TabsContent>

              <TabsContent value="pending" className="mt-4">
                <ContactsTable
                  contacts={contacts?.filter(c => c.status === 'pending') || []}
                  getCallStatusBadge={getCallStatusBadge}
                  callsMap={callsMap}
                />
              </TabsContent>

              <TabsContent value="calling" className="mt-4">
                <ContactsTable
                  contacts={contacts?.filter(c => c.status === 'calling') || []}
                  getCallStatusBadge={getCallStatusBadge}
                  callsMap={callsMap}
                />
              </TabsContent>

              <TabsContent value="retry" className="mt-4">
                <ContactsTable
                  contacts={contacts?.filter(c => c.status === 'retry_wait') || []}
                  getCallStatusBadge={getCallStatusBadge}
                  callsMap={callsMap}
                />
              </TabsContent>

              <TabsContent value="completed" className="mt-4">
                <ContactsTable
                  contacts={contacts?.filter(c => c.status === 'completed') || []}
                  getCallStatusBadge={getCallStatusBadge}
                  callsMap={callsMap}
                />
              </TabsContent>

              <TabsContent value="failed" className="mt-4">
                <ContactsTable
                  contacts={contacts?.filter(c => ['failed', 'cancelled'].includes(c.status)) || []}
                  getCallStatusBadge={getCallStatusBadge}
                  callsMap={callsMap}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function ContactsTable({
  contacts,
  getCallStatusBadge,
  callsMap,
}: {
  contacts: any[]
  getCallStatusBadge: (status: string) => React.ReactElement
  callsMap: Map<string, string>
}) {
  if (contacts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Bu kategoride kişi bulunmuyor
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Sıra</TableHead>
          <TableHead>İsim</TableHead>
          <TableHead>Telefon</TableHead>
          <TableHead>Durum</TableHead>
          <TableHead>Deneme</TableHead>
          <TableHead>Süre</TableHead>
          <TableHead>Arama Zamanı</TableHead>
          <TableHead>Hata</TableHead>
          <TableHead className="text-right">İşlem</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {contacts.map((contact) => {
          const callId = contact.vapi_call_id ? callsMap.get(contact.vapi_call_id) : null
          return (
            <TableRow key={contact.id}>
              <TableCell>{contact.call_order}</TableCell>
              <TableCell className="font-medium">{contact.customer_name}</TableCell>
              <TableCell>{contact.customer_phone}</TableCell>
              <TableCell>{getCallStatusBadge(contact.status)}</TableCell>
              <TableCell>{contact.attempt_count || 0}</TableCell>
              <TableCell className="font-mono text-sm">
                {formatDuration(contact.call_duration)}
              </TableCell>
              <TableCell className="text-xs">
                {contact.called_at
                  ? new Date(contact.called_at).toLocaleString('tr-TR')
                  : '-'
                }
              </TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={contact.last_error || contact.error_message || ''}>
                {contact.last_error || contact.error_message || '-'}
              </TableCell>
              <TableCell className="text-right">
                {callId ? (
                  <Link href={`/dashboard/calls/${callId}`}>
                    <Button variant="ghost" size="sm" className="h-7 px-2">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Detay
                    </Button>
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <Suspense fallback={<CampaignDetailSkeleton />}>
      <CampaignDetailContent campaignId={id} />
    </Suspense>
  )
}