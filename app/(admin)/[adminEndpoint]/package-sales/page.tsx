import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Package, TrendingUp, ShoppingCart } from 'lucide-react'

async function SalesContent() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: purchases } = await supabase
    .from('package_purchases')
    .select('*, minute_packages(name, minutes)')
    .order('created_at', { ascending: false })
    .limit(100)

  // Auth users için email lookup
  const userIds = [...new Set((purchases || []).map((p: { user_id: string }) => p.user_id))]
  const userEmails = new Map<string, string>()
  for (const uid of userIds) {
    const { data: { user } } = await supabase.auth.admin.getUserById(uid)
    if (user?.email) userEmails.set(uid, user.email)
  }

  const totalRevenue = (purchases || []).reduce((s, p: { amount_paid?: number }) => s + parseFloat(String(p.amount_paid || 0)), 0)
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const monthRevenue = (purchases || [])
    .filter((p: { created_at: string }) => new Date(p.created_at) >= startOfMonth)
    .reduce((s, p: { amount_paid?: number }) => s + parseFloat(String(p.amount_paid || 0)), 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Toplam Satış</p>
              <p className="text-2xl font-bold tabular-nums">{(purchases || []).length}</p>
            </div>
            <ShoppingCart className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Toplam Gelir</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-600">{totalRevenue.toFixed(2)}₺</p>
            </div>
            <TrendingUp className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Bu Ay Gelir</p>
              <p className="text-2xl font-bold tabular-nums">{monthRevenue.toFixed(2)}₺</p>
            </div>
            <Package className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paket Satış Geçmişi</CardTitle>
          <CardDescription>Son 100 paket satın alma</CardDescription>
        </CardHeader>
        <CardContent>
          {(purchases || []).length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Henüz paket satışı yok
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kullanıcı</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead>Dakika</TableHead>
                  <TableHead>Tutar</TableHead>
                  <TableHead>Ödeme</TableHead>
                  <TableHead>Tarih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(purchases as Array<{ id: string; user_id: string; minute_packages?: { name?: string; minutes?: number }; amount_paid?: number; payment_provider?: string; created_at: string }>).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{userEmails.get(p.user_id) || p.user_id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.minute_packages?.name || '-'}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{(p.minute_packages?.minutes || 0).toLocaleString('tr-TR')}</TableCell>
                    <TableCell className="tabular-nums font-medium text-emerald-600">{parseFloat(String(p.amount_paid || 0)).toFixed(2)}₺</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px]">{p.payment_provider || 'manual'}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString('tr-TR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function PackageSalesPage() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Paket Satışları</h1>
          <p className="text-sm text-muted-foreground">Tüm dakika paketi satışları</p>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6 space-y-6">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <SalesContent />
        </Suspense>
      </div>
    </>
  )
}
