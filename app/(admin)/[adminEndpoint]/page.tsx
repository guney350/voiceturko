import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, CreditCard, Phone, DollarSign, TrendingUp, TrendingDown } from 'lucide-react'

async function DashboardStats() {
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

  // Toplam kullanıcı sayısı (auth.users'dan)
  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  const totalUsers = users?.length || 0

  // Aktif paketli kullanıcı (paket dakikası > 0)
  const { count: activePackageUsers } = await supabase
    .from('user_balances')
    .select('user_id', { count: 'exact', head: true })
    .gt('package_minutes_remaining', 0)

  // Toplam çağrı sayısı
  const { count: totalCalls } = await supabase
    .from('calls')
    .select('id', { count: 'exact', head: true })

  // Bu ayki çağrılar
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { count: monthCalls } = await supabase
    .from('calls')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfMonth.toISOString())

  // Toplam gelir: paket + kredi yüklemeleri (paid payment_intents)
  const { data: paidIntents } = await supabase
    .from('payment_intents')
    .select('amount, currency, created_at')
    .eq('status', 'paid')

  const totalRevenue = (paidIntents || []).reduce((s, p) => s + parseFloat(String(p.amount || 0)), 0)
  const monthRevenue = (paidIntents || [])
    .filter(p => new Date(p.created_at) >= startOfMonth)
    .reduce((s, p) => s + parseFloat(String(p.amount || 0)), 0)

  const stats = [
    {
      title: 'Toplam Kullanıcı',
      value: totalUsers,
      description: 'Kayıtlı kullanıcı sayısı',
      icon: Users,
      trend: null,
    },
    {
      title: 'Aktif Paketli',
      value: activePackageUsers || 0,
      description: 'Paket dakikası olan kullanıcı',
      icon: CreditCard,
      trend: null,
    },
    {
      title: 'Toplam Çağrı',
      value: totalCalls || 0,
      description: `Bu ay: ${monthCalls || 0}`,
      icon: Phone,
      trend: monthCalls && totalCalls ? ((monthCalls / totalCalls) * 100).toFixed(1) : null,
    },
    {
      title: 'Toplam Gelir',
      value: `₺${totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
      description: `Bu ay: ₺${monthRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      trend: monthRevenue && totalRevenue ? ((monthRevenue / totalRevenue) * 100).toFixed(1) : null,
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
            {stat.trend && (
              <div className="mt-2 flex items-center text-xs">
                {Number(stat.trend) > 0 ? (
                  <>
                    <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
                    <span className="text-green-500">{stat.trend}%</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
                    <span className="text-red-500">{stat.trend}%</span>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4 rounded" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-20 mb-2" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

async function RecentActivity() {
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

  // Son 10 audit log
  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  // Her log için user bilgisini çek
  const enrichedLogs = await Promise.all(
    (logs || []).map(async (log) => {
      if (!log.user_id) {
        return { ...log, user: null }
      }
      const { data: { user } } = await supabase.auth.admin.getUserById(log.user_id)
      return {
        ...log,
        user: { email: user?.email }
      }
    })
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Son Aktiviteler</CardTitle>
        <CardDescription>Sistemdeki son işlemler</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {enrichedLogs && enrichedLogs.length > 0 ? (
            enrichedLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div>
                  <p className="text-sm font-medium">{log.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.user?.email || 'Sistem'} • {new Date(log.created_at).toLocaleString('tr-TR')}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    log.status === 'success'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }`}
                >
                  {log.status}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Henüz aktivite yok</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminDashboard() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Yönetim Paneli</h1>
          <p className="text-muted-foreground">Sistem genel bakış ve istatistikler</p>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6 space-y-6">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardStats />
        </Suspense>

        <Suspense fallback={<Skeleton className="h-96" />}>
          <RecentActivity />
        </Suspense>
      </div>
    </>
  )
}