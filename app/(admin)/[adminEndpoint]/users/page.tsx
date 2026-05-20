import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Search, Mail, Eye, Users as UsersIcon, Wallet, Package,
  Phone as PhoneIcon, TrendingUp, Calendar, Bot, Key,
} from 'lucide-react'
import Link from 'next/link'
import { getAdminEndpoint } from '@/lib/admin'

interface UserRow {
  id: string
  email: string
  created_at: string
  last_sign_in: string | null
  package_name: string
  package_minutes_remaining: number
  package_rate_per_minute: number
  credit_try: number
  total_minutes_used: number
  vapi_keys_count: number
  assistants_count: number
  campaigns_count: number
  calls_count: number
}

async function loadUsers(searchQuery?: string): Promise<UserRow[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  if (!authUsers) return []

  const userIds = authUsers.map(u => u.id)
  if (userIds.length === 0) return []

  // Toplu sorgular - paralel
  const [balancesRes, assistantsRes, campaignsRes, callsRes, poolRes] = await Promise.all([
    supabase
      .from('user_balances')
      .select('user_id, package_minutes_remaining, package_rate_per_minute, credit_try, total_minutes_used, minute_packages(name)')
      .in('user_id', userIds),
    supabase
      .from('assistant')
      .select('user_id')
      .in('user_id', userIds),
    supabase
      .from('campaigns')
      .select('user_id')
      .in('user_id', userIds),
    supabase
      .from('calls')
      .select('user_id')
      .in('user_id', userIds),
    supabase
      .from('user_pool_assignments')
      .select('user_id')
      .in('user_id', userIds),
  ])

  type BalRow = {
    user_id: string
    package_minutes_remaining: number
    package_rate_per_minute: number
    credit_try: number
    total_minutes_used: number
    minute_packages?: { name?: string }
  }
  const balancesMap = new Map<string, BalRow>()
  ;(balancesRes.data as unknown as BalRow[] | null)?.forEach((b) => balancesMap.set(b.user_id, b))

  const countByUser = (rows: { user_id: string }[] | null | undefined) => {
    const m = new Map<string, number>()
    rows?.forEach(r => m.set(r.user_id, (m.get(r.user_id) || 0) + 1))
    return m
  }
  const assistantsByUser = countByUser(assistantsRes.data as { user_id: string }[] | null)
  const campaignsByUser = countByUser(campaignsRes.data as { user_id: string }[] | null)
  const callsByUser = countByUser(callsRes.data as { user_id: string }[] | null)
  const poolByUser = countByUser(poolRes.data as { user_id: string }[] | null)

  const rows: UserRow[] = authUsers.map(u => {
    const bal = balancesMap.get(u.id)
    return {
      id: u.id,
      email: u.email || '',
      created_at: u.created_at,
      last_sign_in: u.last_sign_in_at || null,
      package_name: bal?.minute_packages?.name || 'Atanmamış',
      package_minutes_remaining: bal?.package_minutes_remaining || 0,
      package_rate_per_minute: bal?.package_rate_per_minute || 10,
      credit_try: parseFloat(String(bal?.credit_try || 0)),
      total_minutes_used: parseFloat(String(bal?.total_minutes_used || 0)),
      vapi_keys_count: poolByUser.get(u.id) || 0,
      assistants_count: assistantsByUser.get(u.id) || 0,
      campaigns_count: campaignsByUser.get(u.id) || 0,
      calls_count: callsByUser.get(u.id) || 0,
    }
  })

  const filtered = searchQuery
    ? rows.filter(r => r.email.toLowerCase().includes(searchQuery.toLowerCase()))
    : rows

  return filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

async function UsersContent({ searchQuery, adminEndpoint }: { searchQuery?: string; adminEndpoint: string }) {
  const users = await loadUsers(searchQuery)

  // İstatistikler
  const stats = {
    total: users.length,
    withPackage: users.filter(u => u.package_minutes_remaining > 0).length,
    withCredit: users.filter(u => u.credit_try > 0).length,
    totalCredit: users.reduce((s, u) => s + u.credit_try, 0),
    totalMinutesUsed: users.reduce((s, u) => s + u.total_minutes_used, 0),
  }

  return (
    <div className="space-y-6">
      {/* Stat Kartları */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Toplam Kullanıcı</p>
              <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
            </div>
            <UsersIcon className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Aktif Paketli</p>
              <p className="text-2xl font-bold tabular-nums text-blue-600">{stats.withPackage}</p>
            </div>
            <Package className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Toplam Kredi</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-600">{stats.totalCredit.toFixed(0)}₺</p>
            </div>
            <Wallet className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Toplam Kullanım</p>
              <p className="text-2xl font-bold tabular-nums">{Math.floor(stats.totalMinutesUsed).toLocaleString('tr-TR')} dk</p>
            </div>
            <TrendingUp className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
      </div>

      {/* Kullanıcı Listesi */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle>Kullanıcılar ({users.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {searchQuery ? 'Aramanıza uygun kullanıcı bulunamadı' : 'Henüz kullanıcı yok'}
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kullanıcı</TableHead>
                    <TableHead>Aktif Paket</TableHead>
                    <TableHead>Bakiye</TableHead>
                    <TableHead>Kullanım</TableHead>
                    <TableHead>Kaynaklar</TableHead>
                    <TableHead>Kayıt</TableHead>
                    <TableHead className="text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(u => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{u.email}</p>
                            {u.last_sign_in && (
                              <p className="text-[10px] text-muted-foreground">
                                Son: {new Date(u.last_sign_in).toLocaleDateString('tr-TR')}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              u.package_minutes_remaining > 0
                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300'
                                : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300'
                            }`}
                          >
                            {u.package_name}
                          </Badge>
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            {u.package_rate_per_minute.toFixed(0)}₺/dk
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5 text-xs tabular-nums">
                          <p>
                            <span className="font-semibold text-emerald-600">{u.credit_try.toFixed(2)}₺</span>
                            <span className="text-muted-foreground"> kredi</span>
                          </p>
                          {u.package_minutes_remaining > 0 && (
                            <p>
                              <span className="font-semibold text-blue-600">
                                {u.package_minutes_remaining.toLocaleString('tr-TR')}
                              </span>
                              <span className="text-muted-foreground"> dk paket</span>
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs">
                          <PhoneIcon className="w-3 h-3 text-muted-foreground" />
                          <span className="tabular-nums font-medium">{u.calls_count}</span>
                          <span className="text-muted-foreground">arama</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                          {Math.floor(u.total_minutes_used)} dk toplam
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Key className="w-3 h-3" />
                            <span className={u.vapi_keys_count === 0 ? 'text-red-500 font-bold' : ''}>
                              {u.vapi_keys_count}
                            </span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Bot className="w-3 h-3" />
                            {u.assistants_count}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {u.campaigns_count}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          key · bot · kampanya
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {new Date(u.created_at).toLocaleDateString('tr-TR')}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/${adminEndpoint}/users/${u.id}`}>
                          <Button variant="outline" size="sm">
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            Detay
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function UsersSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14" />)}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>
}) {
  const { search } = await searchParams
  const adminEndpoint = getAdminEndpoint()

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Kullanıcı Yönetimi</h1>
            <p className="text-sm text-muted-foreground">
              Tüm kullanıcıları, paketlerini ve bakiyelerini yönetin
            </p>
          </div>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6 space-y-6">
        <form className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              name="search"
              placeholder="Email ile ara..."
              className="pl-9"
              defaultValue={search}
            />
          </div>
          <Button type="submit" variant="outline">Ara</Button>
          {search && (
            <Link href={`/${adminEndpoint}/users`}>
              <Button type="button" variant="ghost">Temizle</Button>
            </Link>
          )}
        </form>

        <Suspense fallback={<UsersSkeleton />}>
          <UsersContent searchQuery={search} adminEndpoint={adminEndpoint} />
        </Suspense>
      </div>
    </>
  )
}
