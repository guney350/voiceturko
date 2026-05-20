'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Zap, AlertCircle, Wallet, Sparkles } from 'lucide-react'
import Link from 'next/link'

interface BalanceData {
  balance: {
    package_minutes_remaining: number
    package_total_minutes: number
    package_rate_per_minute: number
    package_id?: string | null
    credit_try: number
  }
  capacity: {
    canCall: boolean
    estimatedMinutesPossible: number
  }
}

interface PoolCapacity {
  assignedKeys: number
  totalCapacity: number
  usedCapacity: number
  availableCapacity: number
}

export function CapacityCard() {
  const [balance, setBalance] = useState<BalanceData | null>(null)
  const [pool, setPool] = useState<PoolCapacity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/user/balance').then(r => r.json()),
      fetch('/api/user/capacity').then(r => r.json()),
    ]).then(([balRes, capRes]) => {
      if (balRes.success) setBalance(balRes)
      if (capRes.success) setPool(capRes)
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  const hasPackage = (balance?.balance.package_minutes_remaining || 0) > 0
  const hasCredit = (balance?.balance.credit_try || 0) > 0
  const isEmpty = !hasPackage && !hasCredit

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Bakiye Kartı */}
      <Card className={isEmpty ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30' : 'border-primary/30 bg-primary/5'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isEmpty ? <AlertCircle className="h-5 w-5 text-yellow-600" /> : <Wallet className="h-5 w-5 text-primary" />}
            {isEmpty ? 'Bakiye Yok' : 'Bakiyem'}
          </CardTitle>
          <CardDescription>
            {isEmpty ? 'Arama yapmak için paket alın veya kredi yükleyin' : 'Toplam kullanılabilir bakiyeniz'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasPackage && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Aktif Paket</p>
                  <p className="text-xs text-muted-foreground">
                    {balance?.balance.package_rate_per_minute}₺/dk
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{balance?.balance.package_minutes_remaining.toLocaleString('tr-TR')}</p>
                <p className="text-xs text-muted-foreground">dakika</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-3 rounded-lg bg-background border">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm font-semibold">Kredi Bakiyesi</p>
                <p className="text-xs text-muted-foreground">
                  {balance?.balance.package_rate_per_minute && balance.balance.package_rate_per_minute > 0
                    ? `${balance.balance.package_rate_per_minute}₺/dk`
                    : '10₺/dk varsayılan'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{balance?.balance.credit_try.toFixed(2) || '0.00'}₺</p>
              <p className="text-xs text-muted-foreground">
                ~{Math.floor((balance?.balance.credit_try || 0) / (balance?.balance.package_rate_per_minute || 10))} dk
              </p>
            </div>
          </div>

          <div className="pt-2 border-t flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Toplam tahmini süre:</p>
            <p className="text-sm font-bold">
              {balance?.capacity.estimatedMinutesPossible.toLocaleString('tr-TR')} dakika
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Link href="/dashboard/packages">
              <Button variant={isEmpty ? 'default' : 'outline'} size="sm" className="w-full">
                Paket Al
              </Button>
            </Link>
            <Link href="/dashboard/credits">
              <Button variant="outline" size="sm" className="w-full">
                Kredi Yükle
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Kapasite Kartı */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Arama Kapasitesi
          </CardTitle>
          <CardDescription>
            Aynı anda yapabileceğiniz arama sayısı
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pool && pool.assignedKeys > 0 ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">{pool.availableCapacity}</span>
                <span className="text-lg text-muted-foreground">/ {pool.totalCapacity}</span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Şu an aktif</span>
                  <span className="font-medium">{pool.usedCapacity} arama</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      (pool.usedCapacity / pool.totalCapacity) > 0.8 ? 'bg-red-500' :
                      (pool.usedCapacity / pool.totalCapacity) > 0.5 ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}
                    style={{ width: `${(pool.usedCapacity / pool.totalCapacity) * 100}%` }}
                  />
                </div>
              </div>

              <Badge variant="outline" className="text-xs">
                {pool.assignedKeys} hat × 10 eşzamanlı = {pool.totalCapacity} kapasiteli
              </Badge>
            </>
          ) : (
            <div className="text-center py-4">
              <AlertCircle className="h-8 w-8 mx-auto text-yellow-600 mb-2" />
              <p className="text-sm text-muted-foreground">
                Hesabınıza henüz arama kapasitesi tahsis edilmemiş
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Lütfen destek ile iletişime geçin
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
