'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CreditCard, Bitcoin, TrendingDown, TrendingUp, Gift } from 'lucide-react'
import { toast } from 'sonner'
import { useSearchParams } from 'next/navigation'

interface UserBalance {
  package_minutes_remaining: number
  credit_try: number
  total_spent_try: number
  package_rate_per_minute?: number
}

interface CreditTransaction {
  id: string
  amount: number
  balance_after: number
  transaction_type: string
  description: string
  created_at: string
}

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2500]

const TX_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  topup: { label: 'Yükleme', icon: TrendingUp, color: 'text-green-600' },
  call_charge: { label: 'Arama', icon: TrendingDown, color: 'text-red-600' },
  trial_grant: { label: 'Hoş Geldin Kredisi', icon: Gift, color: 'text-blue-600' },
  admin_grant: { label: 'Admin Hediye', icon: Gift, color: 'text-purple-600' },
  refund: { label: 'İade', icon: TrendingUp, color: 'text-green-600' },
}

export default function CreditsPage() {
  const [balance, setBalance] = useState<UserBalance | null>(null)
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('500')
  const [paying, setPaying] = useState<string | null>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    const isSuccess = searchParams.get('success') === 'true'
    if (isSuccess) {
      toast.success('Kredi bakiyenize başarıyla aktarıldı')
    } else if (searchParams.get('cancelled') === 'true') {
      toast.info('Ödeme iptal edildi')
    }
    loadData()

    // Webhook için polling
    if (isSuccess) {
      const interval = setInterval(loadData, 3000)
      const timeout = setTimeout(() => clearInterval(interval), 15000)
      return () => {
        clearInterval(interval)
        clearTimeout(timeout)
      }
    }
  }, [searchParams])

  const loadData = async () => {
    setLoading(true)
    try {
      const [balRes, txRes] = await Promise.all([
        fetch('/api/user/balance').then(r => r.json()),
        fetch('/api/user/transactions').then(r => r.json()),
      ])
      if (balRes.success) setBalance(balRes.balance)
      if (txRes.success) setTransactions(txRes.transactions || [])
    } finally {
      setLoading(false)
    }
  }

  const handleTopup = async (method: 'stripe' | 'oxapay') => {
    const parsedAmount = parseFloat(amount)
    if (!parsedAmount || parsedAmount < 50) {
      toast.error('Minimum 50₺ yükleme yapılabilir')
      return
    }
    setPaying(method)
    try {
      const endpoint = method === 'stripe'
        ? '/api/stripe/create-credit-checkout'
        : '/api/oxapay/create-invoice'

      const body = method === 'stripe'
        ? { amount: parsedAmount }
        : { purpose: 'credit_topup', amount: parsedAmount }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (data.url || data.payUrl) {
        window.location.href = data.url || data.payUrl
      } else {
        toast.error(data.error || 'Ödeme başlatılamadı')
        setPaying(null)
      }
    } catch {
      toast.error('Bir hata oluştu')
      setPaying(null)
    }
  }

  if (loading) {
    return (
      <div className="px-4 lg:px-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Kredilerim</h1>
          <p className="text-muted-foreground">TL kredi bakiyenizi yönetin ve yükleme yapın</p>
        </div>
      </div>

      <div className="px-4 lg:px-6 space-y-6">
        {/* Bakiye + Topup yan yana */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Mevcut bakiye */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle>Kredi Bakiyem</CardTitle>
              <CardDescription>Aramalarda kullanılacak TL bakiye</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-primary">
                {(balance?.credit_try ?? 0).toFixed(2)}₺
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                Yaklaşık {Math.floor((balance?.credit_try || 0) / (balance?.package_rate_per_minute || 10))} dakika konuşma
                <span className="block text-xs mt-1">
                  ({balance?.package_rate_per_minute || 10}₺/dk · paketinizin dakika fiyatından)
                </span>
              </div>
              {balance?.package_minutes_remaining && balance.package_minutes_remaining > 0 ? (
                <Badge variant="outline" className="mt-3">
                  + {balance.package_minutes_remaining.toLocaleString('tr-TR')} dakika paket bakiyesi
                </Badge>
              ) : null}
            </CardContent>
          </Card>

          {/* Hızlı yükleme */}
          <Card>
            <CardHeader>
              <CardTitle>Hızlı Yükleme</CardTitle>
              <CardDescription>Kredi kartı veya kripto ile</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map(q => (
                  <Button
                    key={q}
                    variant={amount === q.toString() ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAmount(q.toString())}
                  >
                    {q.toLocaleString('tr-TR')}₺
                  </Button>
                ))}
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Tutar (₺)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="50"
                  max="50000"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Min 50₺ - Max 50.000₺
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => handleTopup('stripe')} disabled={paying !== null}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  {paying === 'stripe' ? '...' : 'Kart'}
                </Button>
                <Button onClick={() => handleTopup('oxapay')} disabled={paying !== null} variant="outline">
                  <Bitcoin className="h-4 w-4 mr-2" />
                  {paying === 'oxapay' ? '...' : 'Crypto'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* İşlem geçmişi */}
        <Card>
          <CardHeader>
            <CardTitle>İşlem Geçmişi</CardTitle>
            <CardDescription>Son 20 hareket</CardDescription>
          </CardHeader>
          <CardContent>
            {transactions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Açıklama</TableHead>
                    <TableHead>Tür</TableHead>
                    <TableHead className="text-right">Tutar</TableHead>
                    <TableHead className="text-right">Bakiye</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(tx => {
                    const txInfo = TX_LABELS[tx.transaction_type] || { label: tx.transaction_type, icon: TrendingDown, color: 'text-muted-foreground' }
                    const Icon = txInfo.icon
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs">
                          {new Date(tx.created_at).toLocaleString('tr-TR')}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm">{tx.description}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            <Icon className={`h-3 w-3 mr-1 ${txInfo.color}`} />
                            {txInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-mono ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(2)}₺
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {tx.balance_after.toFixed(2)}₺
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">Henüz işlem yok</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
