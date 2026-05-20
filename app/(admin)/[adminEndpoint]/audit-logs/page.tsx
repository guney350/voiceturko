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
import { Activity, CheckCircle, XCircle } from 'lucide-react'

async function AuditLogsTable() {
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

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  // Her log için user bilgilerini çek
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
        <CardTitle>Denetim Kayıtları</CardTitle>
        <CardDescription>Son 200 sistem aktivitesi</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kullanıcı</TableHead>
              <TableHead>İşlem</TableHead>
              <TableHead>Kaynak Tipi</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead>IP Adresi</TableHead>
              <TableHead>Tarih</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enrichedLogs && enrichedLogs.length > 0 ? (
              enrichedLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">
                    {log.user?.email || 'Sistem'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      {log.action}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.resource_type || '-'}</Badge>
                  </TableCell>
                  <TableCell>
                    {log.status === 'success' ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">Başarılı</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-red-600">
                        <XCircle className="h-4 w-4" />
                        <span className="text-sm">Başarısız</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {log.ip_address || '-'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString('tr-TR')}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Log bulunamadı
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function AuditLogsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function AuditLogsPage() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Denetim Kayıtları</h1>
          <p className="text-muted-foreground">Sistem aktivitelerini izle</p>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6 space-y-6">
        <Suspense fallback={<AuditLogsSkeleton />}>
          <AuditLogsTable />
        </Suspense>
      </div>
    </>
  )
}