'use client'

import { useEffect, useState } from 'react'
import { PhoneCall, Clock, Wallet, Package } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface Stats {
  callsThisMonth: number
  totalMinutesUsed: number
  creditBalance: number
  packageMinutesRemaining: number
  packageName: string | null
  packageRate: number
}

export function StatsCards() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/user/balance').then(r => r.json()),
      fetch('/api/user/stats').then(r => r.json()).catch(() => ({ success: false })),
    ]).then(([balRes, statsRes]) => {
      const balance = balRes.success ? balRes.balance : null

      setStats({
        callsThisMonth: statsRes.success ? statsRes.callsThisMonth : 0,
        totalMinutesUsed: statsRes.success ? statsRes.totalMinutesUsed : 0,
        creditBalance: balance?.credit_try || 0,
        packageMinutesRemaining: balance?.package_minutes_remaining || 0,
        packageName: statsRes.success ? statsRes.packageName : null,
        packageRate: balance?.package_rate_per_minute || 10,
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Bu ay Çağrı */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Bu Ay Çağrı</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.callsThisMonth}
          </CardTitle>
          <CardAction>
            <PhoneCall className="w-4 h-4 text-primary" />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {new Date().toLocaleDateString('tr-TR', { month: 'long' })} ayında
          </div>
          <div className="text-muted-foreground text-xs">Tamamlanan arama sayısı</div>
        </CardFooter>
      </Card>

      {/* Toplam Kullanılan Dakika */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Toplam Kullanım</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.totalMinutesUsed.toLocaleString('tr-TR')}
            <span className="text-base font-normal text-muted-foreground ml-1">dk</span>
          </CardTitle>
          <CardAction>
            <Clock className="w-4 h-4 text-blue-500" />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">Toplam konuşma süresi</div>
          <div className="text-muted-foreground text-xs">Hesabınızda biriken</div>
        </CardFooter>
      </Card>

      {/* Kredi Bakiyesi */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Kredi Bakiyem</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.creditBalance.toFixed(2)}
            <span className="text-base font-normal text-muted-foreground ml-1">₺</span>
          </CardTitle>
          <CardAction>
            <Wallet className="w-4 h-4 text-green-600" />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            ~{Math.floor(stats.creditBalance / stats.packageRate)} dakika konuşma
          </div>
          <div className="text-muted-foreground text-xs">{stats.packageRate}₺/dk üzerinden</div>
        </CardFooter>
      </Card>

      {/* Aktif Paket */}
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Aktif Paket</CardDescription>
          <CardTitle className="text-base font-semibold @[250px]/card:text-lg truncate">
            {stats.packageName || 'Başlangıç'}
          </CardTitle>
          <CardAction>
            <Package className="w-4 h-4 text-purple-500" />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {stats.packageMinutesRemaining > 0 ? (
            <>
              <div className="line-clamp-1 flex gap-2 font-medium">
                {stats.packageMinutesRemaining.toLocaleString('tr-TR')} dk kalan
              </div>
              <Badge variant="outline" className="text-[10px]">
                {stats.packageRate}₺/dk
              </Badge>
            </>
          ) : (
            <>
              <div className="line-clamp-1 flex gap-2 font-medium">Kullandıkça öde</div>
              <Badge variant="outline" className="text-[10px]">{stats.packageRate}₺/dakika</Badge>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
