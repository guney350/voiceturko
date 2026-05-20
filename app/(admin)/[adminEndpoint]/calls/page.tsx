import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Phone, Clock } from 'lucide-react'

async function CallsTable() {
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

  const { data: calls } = await supabase
    .from('calls')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  // Her call için user ve subscription bilgilerini çek
  // Kullanıcı email'lerini batch lookup
  const userIds = [...new Set((calls || []).map(c => c.user_id))]
  const userEmails = new Map<string, string>()
  for (const uid of userIds) {
    const { data: { user } } = await supabase.auth.admin.getUserById(uid)
    if (user?.email) userEmails.set(uid, user.email)
  }

  // Aktif paket bilgilerini batch lookup
  const { data: balances } = await supabase
    .from('user_balances')
    .select('user_id, minute_packages(name)')
    .in('user_id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000'])

  const packageMap = new Map<string, string>()
  ;(balances as unknown as Array<{ user_id: string; minute_packages?: { name?: string } }>)?.forEach(b => {
    if (b.minute_packages?.name) packageMap.set(b.user_id, b.minute_packages.name)
  })

  const enrichedCalls = (calls || []).map(call => ({
    ...call,
    user: { email: userEmails.get(call.user_id) || '-' },
    subscription: { plan: { name: packageMap.get(call.user_id) || 'Kullandıkça Öde' } },
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Çağrılar</CardTitle>
        <CardDescription>Son 100 çağrı</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kullanıcı</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Süre</TableHead>
              <TableHead>Transkript</TableHead>
              <TableHead>Analiz</TableHead>
              <TableHead>Tarih</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrichedCalls && enrichedCalls.length > 0 ? (
              enrichedCalls.map((call) => (
                <TableRow key={call.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {call.user?.email || 'Bilinmiyor'}
                    </div>
                  </TableCell>
                  <TableCell>{call.subscription?.plan?.name || '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {call.duration_minutes.toFixed(2)} dk
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={call.transcript ? 'default' : 'secondary'}>
                      {call.transcript ? 'Var' : 'Yok'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={call.analysis ? 'default' : 'secondary'}>
                      {call.analysis ? 'Var' : 'Yok'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(call.created_at).toLocaleString('tr-TR')}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Çağrı bulunamadı
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function CallsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function CallsPage() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Çağrı Yönetimi</h1>
          <p className="text-muted-foreground">Tüm çağrıları görüntüle</p>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6 space-y-6">
        <Suspense fallback={<CallsSkeleton />}>
          <CallsTable />
        </Suspense>
      </div>
    </>
  )
}