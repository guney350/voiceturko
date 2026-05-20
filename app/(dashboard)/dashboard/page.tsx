import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { StatsCards } from './components/stats-cards'
import { CapacityCard } from './components/capacity-card'
import { OnboardingChecklist } from './components/onboarding-checklist'
import { Phone, ArrowRight, CheckCircle2, XCircle, Clock as ClockIcon } from 'lucide-react'

function DashboardSkeleton() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="px-4 lg:px-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-48" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </>
  )
}

function statusBadge(status: string) {
  if (status === 'ended' || status === 'completed') {
    return <CheckCircle2 className="w-4 h-4 text-green-600" />
  }
  if (status === 'failed' || status === 'no-answer' || status === 'busy') {
    return <XCircle className="w-4 h-4 text-red-500" />
  }
  return <ClockIcon className="w-4 h-4 text-yellow-500" />
}

async function DashboardContent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Son 5 arama
  const { data: recentCalls } = await supabase
    .from('calls')
    .select('id, customer_name, customer_number, duration_minutes, status, created_at, ended_reason')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  // Aktif kampanyalar (DOGRU kolonlar: total_contacts, completed_calls, failed_calls)
  const { data: activeCampaigns } = await supabase
    .from('campaigns')
    .select('id, name, status, total_contacts, completed_calls, failed_calls, successful_calls')
    .eq('user_id', user.id)
    .in('status', ['running', 'paused', 'pending'])
    .order('created_at', { ascending: false })
    .limit(3)

  // Asistan sayısı (DOGRU tablo adi: assistant - tekil)
  const { count: assistantsCount } = await supabase
    .from('assistant')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Hoş geldiniz</h1>
          <p className="text-muted-foreground">
            AI çağrı sisteminizin özet görünümü
          </p>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6 space-y-6">
        <OnboardingChecklist />

        <StatsCards />

        <CapacityCard />

        <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
          {/* Son Aramalar */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Son Aramalar</CardTitle>
                <CardDescription>En son 5 çağrı</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/calls">
                  Tümü <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentCalls && recentCalls.length > 0 ? (
                <div className="space-y-3">
                  {recentCalls.map((call) => (
                    <Link
                      key={call.id}
                      href={`/dashboard/calls/${call.id}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
                        <Phone className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {call.customer_name || call.customer_number || 'Bilinmeyen'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(call.created_at).toLocaleString('tr-TR', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusBadge(call.status || 'pending')}
                        <span className="text-sm font-medium tabular-nums">
                          {(call.duration_minutes || 0).toFixed(1)} dk
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Phone className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  Henüz arama yapmadınız
                </div>
              )}
            </CardContent>
          </Card>

          {/* Aktif Kampanyalar */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Aktif Kampanyalar</CardTitle>
                <CardDescription>Devam eden işlemler</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/campaigns">
                  Tümü <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {activeCampaigns && activeCampaigns.length > 0 ? (
                <div className="space-y-3">
                  {activeCampaigns.map((c) => {
                    const total = c.total_contacts || 0
                    const done = c.completed_calls || 0
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0
                    return (
                      <Link
                        key={c.id}
                        href={`/dashboard/campaigns/${c.id}`}
                        className="block p-3 rounded-lg border hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <span className="text-xs text-muted-foreground tabular-nums ml-2">
                            {done}/{total}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              c.status === 'running' ? 'bg-blue-500' :
                              c.status === 'paused' ? 'bg-yellow-500' : 'bg-gray-400'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {c.status === 'running' ? 'Çalışıyor' :
                           c.status === 'paused' ? 'Duraklatıldı' : 'Bekliyor'}
                          {' · '}{pct}%
                        </p>
                      </Link>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 space-y-3">
                  <p className="text-sm text-muted-foreground">Aktif kampanya yok</p>
                  {(assistantsCount || 0) > 0 ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/dashboard/campaigns/create">Kampanya Oluştur</Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/dashboard/assistant/new">Önce Asistan Oluştur</Link>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}
