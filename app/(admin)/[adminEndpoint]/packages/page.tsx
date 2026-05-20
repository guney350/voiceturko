'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

interface Package {
  id: string
  name: string
  minutes: number
  price_per_minute: number
  total_price: number
  currency: string
  display_order: number
  is_active: boolean
  is_featured: boolean
  description: string
}

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<Package[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Package | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    minutes: '',
    price_per_minute: '',
    display_order: '',
    is_active: true,
    is_featured: false,
    description: '',
  })

  useEffect(() => {
    loadPackages()
  }, [])

  const loadPackages = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/packages')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Yuklenemedi')
      setPackages((json.data as Package[]) || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Yukleme hatasi')
    } finally {
      setLoading(false)
    }
  }

  const handleOpen = (pkg?: Package) => {
    if (pkg) {
      setEditing(pkg)
      setForm({
        name: pkg.name,
        minutes: pkg.minutes.toString(),
        price_per_minute: pkg.price_per_minute.toString(),
        display_order: pkg.display_order.toString(),
        is_active: pkg.is_active,
        is_featured: pkg.is_featured,
        description: pkg.description || '',
      })
    } else {
      setEditing(null)
      setForm({
        name: '',
        minutes: '',
        price_per_minute: '',
        display_order: (packages.length + 1).toString(),
        is_active: true,
        is_featured: false,
        description: '',
      })
    }
    setOpen(true)
  }

  const handleSave = async () => {
    if (saving) return
    if (!form.name.trim()) { toast.error('Isim zorunlu'); return }
    if (!form.price_per_minute || parseFloat(form.price_per_minute) <= 0) {
      toast.error('Dakika basina fiyat 0\'dan buyuk olmali')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        minutes: parseInt(form.minutes) || 0,
        price_per_minute: parseFloat(form.price_per_minute),
        display_order: parseInt(form.display_order) || 0,
        is_active: form.is_active,
        is_featured: form.is_featured,
        description: form.description,
      }

      const res = await fetch('/api/admin/packages', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Kaydedilemedi')

      toast.success(editing ? 'Paket guncellendi' : 'Paket eklendi')
      setOpen(false)
      await loadPackages()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu paketi silmek istediginize emin misiniz?')) return
    try {
      const res = await fetch(`/api/admin/packages?id=${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Silinemedi')

      if (json.softDelete) {
        toast.info(json.message || 'Paket pasiflestirildi (kullanan kullanici var)')
      } else {
        toast.success('Paket silindi')
      }
      await loadPackages()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Silme hatasi')
    }
  }

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Paket Yönetimi</h1>
            <p className="text-muted-foreground">Dakika paketlerini ekle, düzenle, sırala</p>
          </div>
          <Button onClick={() => handleOpen()}>
            <Plus className="h-4 w-4 mr-2" />
            Yeni Paket
          </Button>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Tüm Paketler</CardTitle>
            <CardDescription>Sürükle-bırak ile sıralama yakında</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Yükleniyor...</p>
            ) : packages.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">Henüz paket yok</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sıra</TableHead>
                    <TableHead>İsim</TableHead>
                    <TableHead className="text-right">Dakika</TableHead>
                    <TableHead className="text-right">₺/dk</TableHead>
                    <TableHead className="text-right">Toplam</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="text-right">İşlem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{p.display_order}</TableCell>
                      <TableCell className="font-medium">
                        {p.is_featured && <Sparkles className="h-3 w-3 inline mr-1 text-primary" />}
                        {p.name}
                      </TableCell>
                      <TableCell className="text-right font-mono">{p.minutes.toLocaleString('tr-TR')}</TableCell>
                      <TableCell className="text-right font-mono">{p.price_per_minute}₺</TableCell>
                      <TableCell className="text-right font-mono font-bold">{p.total_price.toLocaleString('tr-TR')}₺</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-1 rounded ${p.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                          {p.is_active ? 'Aktif' : 'Pasif'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => handleOpen(p)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Paketi Düzenle' : 'Yeni Paket'}</DialogTitle>
            <DialogDescription>Paket bilgilerini girin</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>İsim</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Başlangıç" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Dakika</Label>
                <Input type="number" value={form.minutes} onChange={e => setForm({ ...form, minutes: e.target.value })} placeholder="10000" />
              </div>
              <div className="space-y-2">
                <Label>₺/dakika</Label>
                <Input type="number" step="0.01" value={form.price_per_minute} onChange={e => setForm({ ...form, price_per_minute: e.target.value })} placeholder="7" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Açıklama</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Küçük ekipler için ideal" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Sıra</Label>
                <Input type="number" value={form.display_order} onChange={e => setForm({ ...form, display_order: e.target.value })} />
              </div>
              <div className="flex items-center justify-between space-y-0 pt-6">
                <Label>Aktif</Label>
                <Switch checked={form.is_active} onCheckedChange={c => setForm({ ...form, is_active: c })} />
              </div>
              <div className="flex items-center justify-between space-y-0 pt-6">
                <Label>Öne Çık</Label>
                <Switch checked={form.is_featured} onCheckedChange={c => setForm({ ...form, is_featured: c })} />
              </div>
            </div>
            {form.minutes && form.price_per_minute && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <strong>Toplam:</strong> {(parseInt(form.minutes) * parseFloat(form.price_per_minute)).toLocaleString('tr-TR')}₺
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
