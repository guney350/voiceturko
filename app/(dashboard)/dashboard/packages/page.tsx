'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Check, Zap, Crown, Building, Sparkles, CreditCard, Bitcoin } from 'lucide-react'
import { toast } from 'sonner'
import { useSearchParams } from 'next/navigation'

interface Package {
  id: string
  name: string
  minutes: number
  price_per_minute: number
  total_price: number
  currency: string
  is_featured: boolean
  description: string
  display_order: number
}

interface UserBalance {
  package_minutes_remaining: number
  package_total_minutes: number
  package_rate_per_minute: number
  package_id: string | null
  credit_try: number
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '0': Zap,        // Başlangıç
  '1': Sparkles,   // Başlangıç (eski display_order 1)
  '2': Crown,      // Popüler
  '3': Building,   // Profesyonel
  '4': Crown,      // Kurumsal
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<Package[]>([])
  const [balance, setBalance] = useState<UserBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    const isSuccess = searchParams.get('success') === 'true'
    const isCancelled = searchParams.get('cancelled') === 'true'

    if (isSuccess) {
      toast.success('Ödeme alındı. Paketiniz aktive ediliyor...')
    } else if (isCancelled) {
      toast.info('Ödeme iptal edildi')
    }

    const loadData = async () => {
      try {
        const [pkgs, bal] = await Promise.all([
          fetch('/api/packages').then(r => r.json()),
          fetch('/api/user/balance').then(r => r.json()),
        ])
        if (pkgs.success) setPackages(pkgs.packages || [])
        if (bal.success) setBalance(bal.balance)
      } catch (err) {
        console.error('Load error:', err)
        toast.error('Veriler yüklenemedi')
      } finally {
        setLoading(false)
      }
    }

    loadData()

    // Success'ten sonra webhook'un işlemesi için 5sn'de bir bakiyeyi tekrar yükle (10 saniye boyunca)
    if (isSuccess) {
      const interval = setInterval(loadData, 3000)
      const timeout = setTimeout(() => clearInterval(interval), 15000)
      return () => {
        clearInterval(interval)
        clearTimeout(timeout)
      }
    }
  }, [searchParams])

  const handlePurchase = async (packageId: string, method: 'stripe' | 'oxapay') => {
    setPurchasing(packageId + ':' + method)
    try {
      const endpoint = method === 'stripe'
        ? '/api/stripe/create-package-checkout'
        : '/api/oxapay/create-invoice'

      const body = method === 'stripe'
        ? { packageId }
        : { purpose: 'package', packageId }

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
        setPurchasing(null)
      }
    } catch {
      toast.error('Bir hata oluştu')
      setPurchasing(null)
    }
  }

  if (loading) {
    return (
      <div className="px-4 lg:px-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-96" />)}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Paketler</h1>
          <p className="text-muted-foreground">İhtiyacınıza uygun dakika paketini seçin</p>
        </div>
      </div>

      <div className="px-4 lg:px-6 space-y-6">
        {/* Mevcut paket - dakikalı paket varsa progress, Başlangıç paketi ise farklı görünüm */}
        {balance && balance.package_minutes_remaining > 0 ? (
          <Card className="border-primary bg-primary/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Aktif Paket
                </CardTitle>
                <Badge>{balance.package_rate_per_minute}₺/dakika</Badge>
              </div>
              <CardDescription>
                <span className="text-2xl font-bold text-primary">
                  {balance.package_minutes_remaining.toLocaleString('tr-TR')}
                </span>
                {' / '}
                <span className="text-muted-foreground">
                  {balance.package_total_minutes.toLocaleString('tr-TR')} dakika kalan
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${balance.package_total_minutes > 0
                      ? (balance.package_minutes_remaining / balance.package_total_minutes) * 100
                      : 0}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>
        ) : balance && balance.package_rate_per_minute > 0 ? (
          // Başlangıç (pay-as-you-go) paketi aktif
          <Card className="border-green-500/30 bg-green-50/50 dark:bg-green-950/20">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-green-600" />
                  Başlangıç Paketi Aktif
                </CardTitle>
                <Badge className="bg-green-600">{balance.package_rate_per_minute}₺/dakika</Badge>
              </div>
              <CardDescription>
                Kullandıkça öde modeli. Kredi yükleyerek aramaya başla.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Mevcut bakiye</p>
                  <p className="text-2xl font-bold">{(balance.credit_try ?? 0).toFixed(2)}₺</p>
                  <p className="text-xs text-muted-foreground">~{Math.floor(balance.credit_try / 10)} dakika konuşma</p>
                </div>
                <Button onClick={() => window.location.href = '/dashboard/credits'}>
                  <CreditCard className="h-4 w-4 mr-2" />
                  Kredi Yükle
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Paketler grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {packages.map((pkg) => {
            const Icon = ICONS[String(pkg.display_order)] || Zap
            const isPayAsYouGo = pkg.minutes === 0
            const isCurrent = balance?.package_id === pkg.id
            const isFeatured = pkg.is_featured

            return (
              <Card
                key={pkg.id}
                className={`relative ${
                  isCurrent ? 'border-green-500 border-2 shadow-lg' :
                  isFeatured ? 'border-primary border-2 shadow-lg' :
                  ''
                }`}
              >
                {isCurrent && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    ✓ AKTİF PAKETİM
                  </div>
                )}
                {!isCurrent && isFeatured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    EN POPÜLER
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-5 w-5 ${isCurrent ? 'text-green-500' : 'text-primary'}`} />
                    <CardTitle>{pkg.name}</CardTitle>
                  </div>
                  <CardDescription>
                    <div className="text-3xl font-bold text-foreground">
                      {pkg.price_per_minute.toFixed(0)}₺
                      <span className="text-sm text-muted-foreground font-normal">/dakika</span>
                    </div>
                    <div className="text-xs mt-1">{pkg.description}</div>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {isPayAsYouGo ? (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600" />
                          <span className="font-medium">Kullandıkça öde</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600" />
                          <span>Sözleşme yok</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600" />
                          <span>Kredi yükleyerek başla</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600" />
                          <span>İstediğin zaman iptal et</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600" />
                          <span className="font-medium">{pkg.minutes.toLocaleString('tr-TR')} dakika</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600" />
                          <span>100 eşzamanlı arama</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600" />
                          <span>Transkript ve kayıt</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-600" />
                          <span>AI analiz raporu</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                          <span>Aşım ücreti: 10₺/dakika</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="pt-2 border-t">
                    {isPayAsYouGo ? (
                      <>
                        <div className="text-xs text-muted-foreground">Ön ödeme</div>
                        <div className="text-xl font-bold">Yok</div>
                      </>
                    ) : (
                      <>
                        <div className="text-xs text-muted-foreground">Toplam</div>
                        <div className="text-xl font-bold">
                          {pkg.total_price.toLocaleString('tr-TR')}₺
                        </div>
                      </>
                    )}
                  </div>

                  {isPayAsYouGo ? (
                    isCurrent ? (
                      <div className="space-y-2">
                        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-center">
                          <p className="text-xs text-green-800 dark:text-green-200 font-medium">
                            Aktif paketiniz
                          </p>
                          <p className="text-[10px] text-green-700 dark:text-green-300 mt-1">
                            Kredi yükle, hemen aramaya başla
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => window.location.href = '/dashboard/credits'}
                        >
                          <CreditCard className="h-4 w-4 mr-2" />
                          Kredi Yükle
                        </Button>
                      </div>
                    ) : (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => window.location.href = '/dashboard/credits'}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        Kredi Yükle
                      </Button>
                    )
                  ) : (
                    <div className="space-y-2">
                      <Button
                        onClick={() => handlePurchase(pkg.id, 'stripe')}
                        disabled={purchasing !== null}
                        className="w-full"
                        variant={isFeatured ? 'default' : 'outline'}
                      >
                        <CreditCard className="h-4 w-4 mr-2" />
                        {purchasing === pkg.id + ':stripe' ? 'Yönlendiriliyor...' : 'Kart ile Öde'}
                      </Button>
                      <Button
                        onClick={() => handlePurchase(pkg.id, 'oxapay')}
                        disabled={purchasing !== null}
                        className="w-full"
                        variant="ghost"
                        size="sm"
                      >
                        <Bitcoin className="h-4 w-4 mr-2" />
                        {purchasing === pkg.id + ':oxapay' ? 'Yönlendiriliyor...' : 'Crypto ile Öde'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">
              <strong>Nasıl çalışır:</strong> Kayıt olduğunuzda <strong>Başlangıç paketi</strong> otomatik aktif olur (10₺/dakika kullandıkça öde).
              İndirimli fiyat için paket satın alın - paket bitince otomatik olarak 10₺/dakika krediden devam eder.
              Kredi yüklemek için <a href="/dashboard/credits" className="text-primary hover:underline">Kredilerim</a> sayfasını kullanın.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
