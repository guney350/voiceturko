'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { User, Key, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { localizeError } from '@/lib/error-messages'

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const supabase = createClient()

  useEffect(() => {
    loadUser()
  }, [])

  const loadUser = async () => {
    setLoading(true)
    const {
      data: { user: userData },
    } = await supabase.auth.getUser()

    setUser(userData)
    // full_name, name veya display_name'den birini kullan
    const name = userData?.user_metadata?.full_name ||
                 userData?.user_metadata?.name ||
                 userData?.user_metadata?.display_name ||
                 ''
    setDisplayName(name)
    setLoading(false)
  }

  const handleUpdateProfile = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: displayName,
          name: displayName,
          display_name: displayName
        },
      })

      if (error) throw error
      toast.success('Profil güncellendi')
      await loadUser()
    } catch (error) {
      toast.error(localizeError(error))
    } finally {
      setSaving(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Şifreler eşleşmiyor')
      return
    }

    if (newPassword.length < 6) {
      toast.error('Şifre en az 6 karakter olmalıdır')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) throw error
      toast.success('Şifre güncellendi')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error) {
      toast.error(localizeError(error))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="px-4 lg:px-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Ayarlar</h1>
          <p className="text-muted-foreground">Hesap ayarlarınızı yönetin</p>
        </div>
      </div>

      <div className="px-4 lg:px-6 space-y-6">
        <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profil Bilgileri
          </CardTitle>
          <CardDescription>
            Profil bilgilerinizi güncelleyin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={user?.email || ''}
              disabled
            />
            <p className="text-sm text-muted-foreground">
              Email adresiniz değiştirilemez
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="displayName">Ad Soyad</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={saving}
            />
          </div>
          <Button onClick={handleUpdateProfile} disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Profili Güncelle'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Şifre Değiştir
          </CardTitle>
          <CardDescription>
            Hesap şifrenizi güncelleyin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">Yeni Şifre</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Yeni Şifre (Tekrar)</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={saving}
            />
          </div>
          <Button
            onClick={handleUpdatePassword}
            disabled={saving || !newPassword || !confirmPassword}
          >
            {saving ? 'Güncelleniyor...' : 'Şifreyi Güncelle'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Paket & Bakiye Yönetimi
          </CardTitle>
          <CardDescription>
            Paketinizi ve kredilerinizi yönetin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Yeni paket satın alarak dakika fiyatınızı düşürebilir veya kredi yükleyerek pay-as-you-go kullanım yapabilirsiniz.
            Sorularınız için 7/24 canlı destek ekibimizden yardım alabilirsiniz.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.location.href = '/dashboard/packages'}>
              Paketleri Görüntüle
            </Button>
            <Button variant="outline" onClick={() => window.location.href = '/dashboard/credits'}>
              Kredi Yükle
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </>
  )
}