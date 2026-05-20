'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'

interface MinutePricing {
  id: string
  price_per_minute: number
  currency: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export default function PricingPage() {
  const [pricings, setPricings] = useState<MinutePricing[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPricing, setEditingPricing] = useState<MinutePricing | null>(null)
  const [formData, setFormData] = useState({
    price_per_minute: '',
    currency: 'TRY',
    is_active: true,
  })

  useEffect(() => {
    loadPricings()
  }, [])

  const loadPricings = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/pricing')
      const result = await response.json()
      
      if (response.ok) {
        setPricings(result.data || [])
      } else {
        toast.error('Fiyatlandırma yüklenemedi')
      }
    } catch (error) {
      toast.error('Fiyatlandırma yüklenemedi')
      console.error(error)
    }
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!editingPricing) return

    try {
      const response = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingPricing.id,
          pricePerMinute: parseFloat(formData.price_per_minute),
          currency: formData.currency,
          isActive: formData.is_active,
        })
      })

      if (response.ok) {
        toast.success('Fiyatlandırma güncellendi')
        setDialogOpen(false)
        setEditingPricing(null)
        resetForm()
        loadPricings()
      } else {
        toast.error('Fiyatlandırma güncellenemedi')
      }
    } catch (error) {
      toast.error('Bir hata oluştu')
      console.error(error)
    }
  }

  const handleEdit = (pricing: MinutePricing) => {
    setEditingPricing(pricing)
    setFormData({
      price_per_minute: pricing.price_per_minute.toString(),
      currency: pricing.currency,
      is_active: pricing.is_active,
    })
    setDialogOpen(true)
  }

  const resetForm = () => {
    setFormData({
      price_per_minute: '',
      currency: 'TRY',
      is_active: true,
    })
    setEditingPricing(null)
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
            <h1 className="text-2xl font-bold tracking-tight">Dakika Fiyatlandırma</h1>
            <p className="text-muted-foreground">Dakika başına fiyatları yönet</p>
          </div>
        <Dialog open={dialogOpen} onOpenChange={handleDialogClose}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Fiyat Düzenle</DialogTitle>
              <DialogDescription>
                Dakika fiyatını düzenleyin
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="price">Dakika Başı Fiyat</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={formData.price_per_minute}
                    onChange={(e) =>
                      setFormData({ ...formData, price_per_minute: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="currency">Para Birimi</Label>
                  <Input
                    id="currency"
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    required
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_active: checked })
                    }
                  />
                  <Label htmlFor="active">Aktif</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleDialogClose}>
                  İptal
                </Button>
                <Button type="submit">Güncelle</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6 space-y-6">
        <Card>
        <CardHeader>
          <CardTitle>Fiyatlandırma</CardTitle>
          <CardDescription>Toplam {pricings.length} fiyat</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Yükleniyor...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dakika Başı Fiyat</TableHead>
                  <TableHead>Para Birimi</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Oluşturulma</TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricings.length > 0 ? (
                  pricings.map((pricing) => (
                    <TableRow key={pricing.id}>
                      <TableCell className="font-medium">
                        {pricing.price_per_minute.toLocaleString('tr-TR', {
                          minimumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>{pricing.currency}</TableCell>
                      <TableCell>
                        <Badge variant={pricing.is_active ? 'default' : 'secondary'}>
                          {pricing.is_active ? 'Aktif' : 'Pasif'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(pricing.created_at).toLocaleDateString('tr-TR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(pricing)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Henüz fiyat eklenmemiş
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
        </Card>
      </div>
    </>
  )
}