'use client'

import { Button } from '@/components/ui/button'
import { Play, Pause, CheckCircle, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface CampaignActionsProps {
  campaignId: string
  status: string
}

export function CampaignActions({ campaignId, status }: CampaignActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    try {
      // 1) VAPI'den arama detaylarını çek
      const r = await fetch('/api/calls/sync-all', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Senkronizasyon hatası')

      // 2) Bu kampanyanın sayaçlarını yeniden hesapla
      const recountRes = await fetch(`/api/campaigns/${campaignId}/recount`, { method: 'POST' })
      const recountData = await recountRes.json()

      const synced = d.synced || 0
      const forceFixed = d.forceFixed || 0
      const stillActive = d.stillActive || 0

      if (synced + forceFixed === 0 && stillActive === 0) {
        if (recountData?.allFinished) {
          toast.success('Kampanya tamamlandı olarak güncellendi')
        } else {
          toast.info('Güncellenmesi gereken arama yok')
        }
      } else {
        const parts = []
        if (synced > 0) parts.push(`${synced} arama güncellendi`)
        if (forceFixed > 0) parts.push(`${forceFixed} sabit kalan düzeltildi`)
        if (stillActive > 0) parts.push(`${stillActive} devam ediyor`)
        toast.success(parts.join(' · '))
      }
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setSyncing(false)
    }
  }

  const handleStart = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/start`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Başlatılamadı')
      toast.success(status === 'paused' ? 'Kampanya devam ettiriliyor' : 'Kampanya başlatıldı')
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setLoading(false)
    }
  }

  const handlePause = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/pause`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Duraklatılamadı')
      toast.success(d.autoCompleted ? 'Tüm aramalar bitmiş - kampanya tamamlandı' : 'Kampanya duraklatıldı')
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/campaigns/${campaignId}/complete`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Tamamlanamadı')
      if (d.completed) {
        toast.success('Kampanya tamamlandı')
      } else {
        toast.info(d.message || 'Bekleyen aramalar iptal edildi, aktif aramalar bittiğinde kampanya kapanacak')
      }
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Aramaları Yenile - her zaman görünür */}
      <Button variant="outline" onClick={handleSync} disabled={syncing}>
        <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Yenileniyor...' : 'Aramaları Yenile'}
      </Button>

      {(status === 'draft' || status === 'pending') && (
        <Button onClick={handleStart} disabled={loading}>
          <Play className="h-4 w-4 mr-2" />
          {loading ? 'Başlatılıyor...' : 'Başlat'}
        </Button>
      )}

      {status === 'paused' && (
        <Button onClick={handleStart} disabled={loading}>
          <Play className="h-4 w-4 mr-2" />
          {loading ? 'Devam ediyor...' : 'Devam Ettir'}
        </Button>
      )}

      {(status === 'active' || status === 'running') && (
        <Button variant="outline" onClick={handlePause} disabled={loading}>
          <Pause className="h-4 w-4 mr-2" />
          {loading ? 'Duraklatılıyor...' : 'Duraklat'}
        </Button>
      )}

      {/* Tamamla butonu - hem running hem paused hem pending'de */}
      {(status === 'running' || status === 'paused' || status === 'pending') && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={loading} className="text-emerald-600 hover:text-emerald-700">
              <CheckCircle className="h-4 w-4 mr-2" />
              Tamamla
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Kampanyayı tamamla?</AlertDialogTitle>
              <AlertDialogDescription>
                Bekleyen tüm aramalar iptal edilecek. Devam eden aktif aramalar bittiğinde
                kampanya otomatik olarak tamamlanacak. Bu işlem geri alınamaz.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Vazgeç</AlertDialogCancel>
              <AlertDialogAction onClick={handleComplete} disabled={loading}>
                Evet, Tamamla
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
