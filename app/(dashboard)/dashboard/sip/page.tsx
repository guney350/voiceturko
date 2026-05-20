'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoHint } from '@/components/ui/info-hint'
import { PhoneCall, Plus, Trash2, Edit } from 'lucide-react'
import { toast } from 'sonner'

export default function SipPage() {
  const [sips, setSips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSip, setEditingSip] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    ip_address: '',
    port: 5060,
    username: '',
    password: '',
    phoneNumber: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadSips()
  }, [])

  const loadSips = async () => {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data } = await supabase
      .from('sips')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })

    setSips(data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)

    try {
      if (editingSip) {
        // Guncelle - server endpoint kullan (DB + VAPI 10 hatta re-provision)
        const res = await fetch('/api/sip', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sipId: editingSip.id,
            name: formData.name,
            ipAddress: formData.ip_address,
            port: formData.port,
            username: formData.username,
            password: formData.password,
            phoneNumber: formData.phoneNumber,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'SIP guncellenemedi')

        if (data.provisioning) {
          const { successful, total } = data.provisioning
          if (successful === total) {
            toast.success('SIP ayarlari guncellendi ve tum hatlara yenilendi')
          } else {
            toast.warning(`SIP guncellendi ama ${successful}/${total} hatta yenilendi`)
          }
        } else {
          toast.success('SIP ayarlari guncellendi')
        }
      } else {
        // Yeni oluştur - arama altyapısına tüm hatlara otomatik dağıtılır
        const res = await fetch('/api/sip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            ipAddress: formData.ip_address,
            port: formData.port,
            username: formData.username,
            password: formData.password,
            phoneNumber: formData.phoneNumber,
          }),
        })
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || data.detail || 'SIP eklenemedi')
        }

        const successCount = data.data?.provisioning?.successful || 0
        const totalCount = data.data?.provisioning?.total || 10
        toast.success(`SIP bağlantısı eklendi (${successCount}/${totalCount} arama hattına kuruldu)`)
      }

      setDialogOpen(false)
      resetForm()
      await loadSips()
    } catch (error: any) {
      toast.error(error.message || 'Bir hata oluştu')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (sip: any) => {
    setEditingSip(sip)
    setFormData({
      name: sip.name,
      ip_address: sip.ip_address,
      port: sip.port,
      username: sip.username,
      password: sip.password,
      phoneNumber: sip.phone_number || '',
    })
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/sip?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Silinemedi')
      }
      toast.success('SIP bağlantısı tüm hatlardan silindi')
      await loadSips()
    } catch (error: any) {
      toast.error(error.message || 'Bir hata oluştu')
    }
  }

  const resetForm = () => {
    setEditingSip(null)
    setFormData({
      name: '',
      ip_address: '',
      port: 5060,
      username: '',
      password: '',
      phoneNumber: '',
    })
  }

  const handleDialogClose = () => {
    setDialogOpen(false)
    resetForm()
  }

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight">SIP Ayarları</h1>
            <p className="text-muted-foreground">Telefon sistemi entegrasyonlarınızı yönetin</p>
          </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="mr-2 h-4 w-4" />
              Yeni SIP Ekle
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingSip ? 'SIP Düzenle' : 'Yeni SIP Ekle'}
              </DialogTitle>
              <DialogDescription>
                SIP sunucu bilgilerinizi girin
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-200">
                <strong>İpucu:</strong> SIP bilgilerini sağlayıcınızdan (Karel, NetGSM, Türk Telekom vb.) alabilirsiniz. Her alana tıklayıp{' '}
                <kbd className="px-1 rounded bg-blue-100 dark:bg-blue-900">?</kbd> ikonuna basınca detaylı bilgi açılır.
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-1.5">
                  İsim
                  <InfoHint
                    title="SIP Bağlantı İsmi"
                    content="Bu bağlantıyı tanımak için verdiğin bir isim. **Sadece sen göreceksin**, müşterilere görünmez. Örn: 'Ofis Hattı', 'Karel Ana Hat', 'Müşteri Hizmetleri'."
                    example="Ofis Hattı"
                  />
                </Label>
                <Input
                  id="name"
                  placeholder="Ofis Hattı"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ip_address" className="flex items-center gap-1.5">
                  IP Adresi
                  <InfoHint
                    title="SIP Sunucu IP Adresi"
                    content="SIP sağlayıcınızın **gateway IP adresi**. SIP sağlayıcınızdan email/panel üzerinden alabilirsin.\n\n**Karel kullanıyorsan:** Karel paneli → SIP Hesaplar → Gateway IP\n\n**NetGSM:** Müşteri paneli → SIP bilgileri\n\n**Genelde format:** xxx.xxx.xxx.xxx (4 sayı, nokta ile ayrık)"
                    example="185.92.12.12"
                  />
                </Label>
                <Input
                  id="ip_address"
                  placeholder="185.92.12.12"
                  value={formData.ip_address}
                  onChange={(e) =>
                    setFormData({ ...formData, ip_address: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="port" className="flex items-center gap-1.5">
                  Port
                  <InfoHint
                    variant="info"
                    title="SIP Port Numarası"
                    content="SIP protokolünün varsayılan portu **5060**'tır. Sağlayıcın özel bir port belirtmediyse 5060'ı kullan.\n\nNadiren `5061` (TLS) veya başka bir port kullanılır."
                    example="5060"
                  />
                </Label>
                <Input
                  id="port"
                  type="number"
                  placeholder="5060"
                  value={formData.port}
                  onChange={(e) =>
                    setFormData({ ...formData, port: parseInt(e.target.value) })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username" className="flex items-center gap-1.5">
                  Kullanıcı Adı / Numara
                  <InfoHint
                    title="SIP Kullanıcı Adı"
                    content="SIP hesabınızın **authentication username**'i. Genelde **telefon numaranızın** rakamları (+90 olmadan) olur.\n\n**Örn:** Telefon `+903129552013` ise, kullanıcı adı `903129552013` olabilir.\n\nSağlayıcınızdan teyit edin. **Telefon Numarası alanı bu değere göre otomatik doldurulur.**"
                    example="903129552013"
                  />
                </Label>
                <Input
                  id="username"
                  placeholder="903129552013"
                  value={formData.username}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\s/g, '')
                    // Username değiştiğinde phoneNumber otomatik "+" eklenmiş halini al
                    const digits = val.replace(/^\+/, '').replace(/\D/g, '')
                    setFormData({
                      ...formData,
                      username: val,
                      phoneNumber: digits ? `+${digits}` : '',
                    })
                  }}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-1.5">
                  Şifre
                  <InfoHint
                    variant="warning"
                    title="SIP Şifresi"
                    content="SIP hesabınızın **şifresi** (auth password). Bu güvenli bir bilgidir, başkasıyla paylaşma.\n\nSağlayıcı paneli/email ile sana verilir. Asla varsayılan değil, sana özel olmalı."
                  />
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber" className="flex items-center gap-1.5">
                  Telefon Numarası (Otomatik)
                  <InfoHint
                    variant="info"
                    title="Outbound Telefon Numarası"
                    content="**Otomatik oluşturuldu.** Üstteki Kullanıcı Adı alanından alınır ve başına **+** eklenir (E.164 formatı).\n\nManuel düzenlemeye gerek yoktur — sistem doğru formatta oluşturup arama altyapısına gönderir."
                    example="+903129552013"
                  />
                </Label>
                <Input
                  id="phoneNumber"
                  placeholder="Önce 'Kullanıcı Adı / Numara' alanını doldurun"
                  value={formData.phoneNumber || ''}
                  readOnly
                  disabled
                  className="bg-muted/40 cursor-not-allowed font-mono text-sm"
                  tabIndex={-1}
                />
                {formData.phoneNumber && (
                  <p className="text-[10px] text-muted-foreground">
                    Otomatik üretildi · arama altyapısında bu numara kullanılır
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleDialogClose} disabled={submitting}>
                  İptal
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting
                    ? (editingSip ? 'Güncelleniyor...' : 'Hatlara kuruluyor...')
                    : (editingSip ? 'Güncelle' : 'Ekle')
                  }
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5" />
            SIP Sunucuları
          </CardTitle>
          <CardDescription>
            Kayıtlı SIP sunucularınız
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sips.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>İsim</TableHead>
                  <TableHead>IP Adresi</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Kullanıcı Adı</TableHead>
                  <TableHead>İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sips.map((sip) => (
                  <TableRow key={sip.id}>
                    <TableCell className="font-medium">{sip.name}</TableCell>
                    <TableCell>{sip.ip_address}</TableCell>
                    <TableCell>{sip.port}</TableCell>
                    <TableCell>{sip.username}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(sip)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Emin misiniz?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Bu SIP ayarını silmek istediğinizden emin misiniz?
                                Bu işlem geri alınamaz.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>İptal</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(sip.id)}
                              >
                                Sil
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <PhoneCall className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">
                Henüz SIP sunucusu eklenmemiş
              </p>
              <Button
                className="mt-4"
                onClick={() => {
                  resetForm()
                  setDialogOpen(true)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                İlk SIP'i Ekle
              </Button>
            </div>
          )}
        </CardContent>
        </Card>
      </div>
    </>
  )
}