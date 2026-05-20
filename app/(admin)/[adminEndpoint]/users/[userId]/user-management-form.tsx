'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CreditCard, Clock, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Plan {
  id: string
  name: string
  price: number
  currency: string
  included_minutes: number
}

interface Subscription {
  id: string
  plan_id: string
  status: string
}

export function UserManagementForm({
  userId,
  subscription,
  plans,
}: {
  userId: string
  subscription: Subscription | null
  plans: Plan[]
}) {
  const router = useRouter()
  const [selectedPlan, setSelectedPlan] = useState(subscription?.plan_id || '')
  const [additionalMinutes, setAdditionalMinutes] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleAssignPlan = async () => {
    if (!selectedPlan) {
      toast.error('Lütfen bir plan seçin')
      return
    }

    setLoading(true)
    const startDate = new Date()
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + 1)

    if (subscription) {
      // Mevcut subscription'ı güncelle
      const { error } = await supabase
        .from('subscriptions')
        .update({
          plan_id: selectedPlan,
          status: 'active',
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          current_period_start: startDate.toISOString(),
          current_period_end: endDate.toISOString(),
        })
        .eq('id', subscription.id)

      if (error) {
        toast.error('Plan güncellenemedi')
        console.error(error)
      } else {
        toast.success('Plan güncellendi')
        router.refresh()
      }
    } else {
      // Yeni subscription oluştur
      const { error } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: selectedPlan,
          status: 'active',
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          current_period_start: startDate.toISOString(),
          current_period_end: endDate.toISOString(),
        })

      if (error) {
        toast.error('Plan atanamadı')
        console.error(error)
      } else {
        toast.success('Plan atandı')
        router.refresh()
      }
    }
    setLoading(false)
  }

  const handleAddMinutes = async () => {
    const minutes = parseInt(additionalMinutes)
    if (!minutes || minutes <= 0) {
      toast.error('Geçerli bir dakika değeri girin')
      return
    }

    setLoading(true)
    const { error } = await supabase
      .from('minute_purchases')
      .insert({
        user_id: userId,
        minutes: minutes,
        price_per_minute: 0,
        total_price: 0,
        status: 'completed',
        payment_method: 'admin_grant',
      })

    if (error) {
      toast.error('Dakika eklenemedi')
      console.error(error)
    } else {
      toast.success(`${minutes} dakika eklendi`)
      setAdditionalMinutes('')
    }
    setLoading(false)
  }

  const handleCancelSubscription = async () => {
    if (!subscription) return

    setLoading(true)
    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'canceled' })
      .eq('id', subscription.id)

    if (error) {
      toast.error('Abonelik iptal edilemedi')
      console.error(error)
    } else {
      toast.success('Abonelik iptal edildi')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <>
      {/* Plan Yönetimi */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            <CardTitle>Plan Yönetimi</CardTitle>
          </div>
          <CardDescription>
            {subscription ? 'Mevcut planı değiştir veya iptal et' : 'Kullanıcıya plan ata'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Plan Seç</Label>
            <Select value={selectedPlan} onValueChange={setSelectedPlan} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Plan seçin" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} - {plan.price} {plan.currency} ({plan.included_minutes} dk)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleAssignPlan} className="flex-1" disabled={loading}>
              {subscription ? 'Planı Güncelle' : 'Plan Ata'}
            </Button>
            {subscription && subscription.status === 'active' && (
              <Button onClick={handleCancelSubscription} variant="destructive" disabled={loading}>
                İptal Et
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dakika Ekleme */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            <CardTitle>Ek Dakika Tanımla</CardTitle>
          </div>
          <CardDescription>Kullanıcıya ücretsiz ek dakika ekle</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Dakika Miktarı</Label>
            <Input
              type="number"
              placeholder="Örn: 100"
              value={additionalMinutes}
              onChange={(e) => setAdditionalMinutes(e.target.value)}
              disabled={loading}
            />
          </div>
          <Button onClick={handleAddMinutes} className="w-full" disabled={loading}>
            <Phone className="h-4 w-4 mr-2" />
            Dakika Ekle
          </Button>
        </CardContent>
      </Card>
    </>
  )
}