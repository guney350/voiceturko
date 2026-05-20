import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Wallet, TrendingDown, TrendingUp } from 'lucide-react'

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  topup: { label: 'Yükleme', color: 'text-emerald-600' },
  call_charge: { label: 'Arama', color: 'text-red-600' },
  trial_grant: { label: 'Hoş Geldin', color: 'text-blue-600' },
  admin_grant: { label: 'Admin Hediye', color: 'text-purple-600' },
  refund: { label: 'İade', color: 'text-emerald-600' },
}

async function TxContent() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: txs } = await supabase
    .from('credit_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  const userIds = [...new Set((txs || []).map((t: { user_id: string }) => t.user_id))]
  const userEmails = new Map<string, string>()
  for (const uid of userIds) {
    const { data: { user } } = await supabase.auth.admin.getUserById(uid)
    if (user?.email) userEmails.set(uid, user.email)
  }

  const totalIn = (txs || []).filter((t: { amount: number }) => t.amount > 0).reduce((s, t: { amount: number }) => s + t.amount, 0)
  const totalOut = (txs || []).filter((t: { amount: number }) => t.amount < 0).reduce((s, t: { amount: number }) => s + Math.abs(t.amount), 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Toplam İşlem</p>
              <p className="text-2xl font-bold tabular-nums">{(txs || []).length}</p>
            </div>
            <Wallet className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Toplam Giriş</p>
              <p className="text-2xl font-bold tabular-nums text-emerald-600">+{totalIn.toFixed(2)}₺</p>
            </div>
            <TrendingUp className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Toplam Çıkış</p>
              <p className="text-2xl font-bold tabular-nums text-red-600">-{totalOut.toFixed(2)}₺</p>
            </div>
            <TrendingDown className="w-8 h-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kredi Hareketleri</CardTitle>
          <CardDescription>Son 200 işlem</CardDescription>
        </CardHeader>
        <CardContent>
          {(txs || []).length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Henüz kredi hareketi yok
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kullanıcı</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Açıklama</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead className="text-right">Bakiye Sonrası</TableHead>
                  <TableHead>Tarih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(txs as Array<{ id: string; user_id: string; transaction_type: string; description: string; amount: number; balance_after: number; created_at: string }>).map((t) => {
                  const tInfo = TYPE_LABELS[t.transaction_type] || { label: t.transaction_type, color: 'text-muted-foreground' }
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-sm">{userEmails.get(t.user_id) || t.user_id.slice(0, 8)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${tInfo.color}`}>{tInfo.label}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-xs truncate">{t.description}</TableCell>
                      <TableCell className={`text-right tabular-nums font-mono ${t.amount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {t.amount > 0 ? '+' : ''}{t.amount.toFixed(2)}₺
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-mono">{t.balance_after.toFixed(2)}₺</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString('tr-TR')}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function CreditTransactionsPage() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Kredi Hareketleri</h1>
          <p className="text-sm text-muted-foreground">Tüm kullanıcıların TL kredi işlemleri</p>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6 space-y-6">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <TxContent />
        </Suspense>
      </div>
    </>
  )
}
