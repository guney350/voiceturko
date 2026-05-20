import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

async function StatsContent() {
  // Service role client (RLS bypass)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Auth users (gerçek kullanıcı sayısı)
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const totalUsers = authData?.users?.length || 0

  // Aktif paketli kullanıcılar (paket dakikası > 0 olanlar)
  const { count: activePackageUsers } = await supabase
    .from('user_balances')
    .select('user_id', { count: 'exact', head: true })
    .gt('package_minutes_remaining', 0)

  const { count: totalCalls } = await supabase
    .from('calls')
    .select('id', { count: 'exact', head: true })

  // Toplam gelir: paid payment_intents (Stripe + Oxapay)
  const { data: paidIntents } = await supabase
    .from('payment_intents')
    .select('amount')
    .eq('status', 'paid')

  const totalRevenue = (paidIntents || []).reduce((s, p) => s + parseFloat(String(p.amount || 0)), 0)

  // Kapasite stats
  const { count: totalKeys } = await supabase
    .from('vapi_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')

  const { count: totalAssignments } = await supabase
    .from('user_pool_assignments')
    .select('user_id', { count: 'exact', head: true })

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Toplam Kullanıcı</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{totalUsers}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aktif Paketli Kullanıcı</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{activePackageUsers || 0}</div>
          <p className="text-xs text-muted-foreground mt-1">Paket dakikası kalan</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Toplam Çağrı</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{totalCalls || 0}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Toplam Gelir</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            ₺{totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aktif Arama Hatlar\u0131</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{totalKeys || 0}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Toplam Tahsis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{totalAssignments || 0}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Kullanıcılara atanmış key sayısı
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function StatsPage() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">İstatistikler</h1>
          <p className="text-muted-foreground">Detaylı sistem istatistikleri</p>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6 space-y-6">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <StatsContent />
        </Suspense>
      </div>
    </>
  )
}