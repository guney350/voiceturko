'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Package, Wallet, Key, Gift, Zap } from 'lucide-react'
import { toast } from 'sonner'

interface MinutePackage {
  id: string
  name: string
  minutes: number
  price_per_minute: number
  total_price: number
}

interface UserBalance {
  package_id: string | null
  package_minutes_remaining: number
  package_total_minutes: number
  package_rate_per_minute: number
  credit_try: number
  minute_packages?: { name?: string }
}

interface Props {
  userId: string
  balance: UserBalance | null
  packages: MinutePackage[]
  poolKeysCount: number
}

const QUICK_CREDITS = [50, 100, 250, 500, 1000]

export function UserManagementForm({ userId, balance, packages, poolKeysCount }: Props) {
  const [selectedPackageId, setSelectedPackageId] = useState('')
  const [creditAmount, setCreditAmount] = useState('100')
  const [busy, setBusy] = useState<string | null>(null)

  const handleActivatePackage = async () => {
    if (!selectedPackageId) {
      toast.error('Bir paket seçin')
      return
    }
    setBusy('package')
    try {
      const res = await fetch('/api/admin/activate-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, packageId: selectedPackageId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Paket atanamadı')
      toast.success(`Paket aktive edildi: ${data.minutes.toLocaleString('tr-TR')} dakika eklendi`)
      setTimeout(() => window.location.reload(), 800)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Hata oluştu')
    } finally {
      setBusy(null)
    }
  }

  const handleGrantCredit = async () => {
    const amt = parseFloat(creditAmount)
    if (!amt || amt <= 0) {
      toast.error('Geçerli bir tutar girin')
      return
    }
    setBusy('credit')
    try {
      const res = await fetch('/api/admin/grant-credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount: amt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kredi eklenemedi')
      toast.success(`${amt.toFixed(2)}₺ kredi eklendi (yeni bakiye: ${data.newBalance.toFixed(2)}₺)`)
      setTimeout(() => window.location.reload(), 800)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Hata oluştu')
    } finally {
      setBusy(null)
    }
  }

  const handleAssignKeys = async () => {
    setBusy('keys')
    try {
      const res = await fetch('/api/admin/assign-pool-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, count: 10 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Key tahsisi başarısız')
      toast.success(`${data.assigned} yeni hat tahsis edildi (toplam: ${data.total}/10)`)
      setTimeout(() => window.location.reload(), 800)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Hata oluştu')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Paket Ata */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            Paket Ata
          </CardTitle>
          <CardDescription className="text-xs">
            Kullanıcıya ücretsiz paket hediye edin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Paket Seç</Label>
            <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Bir paket seçin" />
              </SelectTrigger>
              <SelectContent>
                {packages.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-xs">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground ml-2">
                      · {p.minutes.toLocaleString('tr-TR')} dk · {p.price_per_minute}₺/dk
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {balance?.package_id && (
            <div className="text-[11px] bg-muted/50 rounded p-2">
              <p className="font-medium">Mevcut: {balance.minute_packages?.name}</p>
              <p className="text-muted-foreground">
                {balance.package_minutes_remaining.toLocaleString('tr-TR')} / {balance.package_total_minutes.toLocaleString('tr-TR')} dk kaldı
              </p>
            </div>
          )}
          <Button
            onClick={handleActivatePackage}
            disabled={busy !== null || !selectedPackageId}
            size="sm"
            className="w-full"
          >
            <Gift className="w-3.5 h-3.5 mr-1.5" />
            {busy === 'package' ? 'Atanıyor...' : 'Paketi Aktive Et'}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Ücret tahsil edilmez. Mevcut paket varsa üzerine kalan dakikalar eklenir.
          </p>
        </CardContent>
      </Card>

      {/* Kredi Hediye */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-600" />
            Kredi Hediye Et
          </CardTitle>
          <CardDescription className="text-xs">
            Kullanıcının TL kredi bakiyesine ekle
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {QUICK_CREDITS.map(q => (
              <Button
                key={q}
                size="sm"
                variant={creditAmount === q.toString() ? 'default' : 'outline'}
                onClick={() => setCreditAmount(q.toString())}
                className="text-xs px-2 h-7"
              >
                {q}₺
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tutar (₺)</Label>
            <Input
              type="number"
              min="1"
              max="100000"
              value={creditAmount}
              onChange={e => setCreditAmount(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="text-[11px] bg-muted/50 rounded p-2">
            <p>
              Mevcut: <span className="font-mono font-semibold text-emerald-600">{(balance?.credit_try || 0).toFixed(2)}₺</span>
            </p>
          </div>
          <Button
            onClick={handleGrantCredit}
            disabled={busy !== null || !creditAmount}
            size="sm"
            className="w-full"
            variant="default"
          >
            <Gift className="w-3.5 h-3.5 mr-1.5" />
            {busy === 'credit' ? 'Ekleniyor...' : 'Krediyi Ekle'}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Hediye olarak işlenir (admin_grant). Geri alınamaz.
          </p>
        </CardContent>
      </Card>

      {/* Arama Hatları */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Key className="w-4 h-4 text-purple-600" />
            Arama Hatları
          </CardTitle>
          <CardDescription className="text-xs">
            Pool&apos;dan 10 hat tahsis et
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-center py-3 bg-muted/30 rounded space-y-1">
            <p className={`text-3xl font-bold tabular-nums ${
              poolKeysCount < 10 ? 'text-yellow-600' : 'text-emerald-600'
            }`}>
              {poolKeysCount}/10
            </p>
            <p className="text-[10px] text-muted-foreground">
              Tahsis edilmiş hat sayısı
            </p>
            <Badge variant="outline" className="text-[10px]">
              <Zap className="w-2.5 h-2.5 mr-1" />
              {poolKeysCount * 10} eşzamanlı arama kapasitesi
            </Badge>
          </div>
          <Button
            onClick={handleAssignKeys}
            disabled={busy !== null || poolKeysCount >= 10}
            size="sm"
            variant={poolKeysCount >= 10 ? 'outline' : 'default'}
            className="w-full"
          >
            <Key className="w-3.5 h-3.5 mr-1.5" />
            {busy === 'keys' ? 'Tahsis ediliyor...' :
              poolKeysCount >= 10 ? 'Hat sayısı tam' : 'Eksik Hatları Tamamla'}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            Mevcut hatlar korunur, sadece eksik olanlar pool&apos;dan tamamlanır.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
