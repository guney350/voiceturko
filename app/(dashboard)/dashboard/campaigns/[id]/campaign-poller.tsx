'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  campaignId: string
  isRunning: boolean
  /** Aktif aramaları varsa kampanya paused/completed olsa bile sync */
  hasActiveCalls?: boolean
}

/**
 * CampaignPoller - akıllı polling
 *
 * - `isRunning`: processor'u tetikle (yeni arama başlatması için)
 * - `hasActiveCalls`: AutoCallSync zaten çalıştığı için sadece UI refresh yeterli
 *
 * Her iki durumda da 8 saniyede bir router.refresh() çağrılır,
 * böylece "Aranıyor" durumundaki itemlar otomatik olarak güncel duruma geçer.
 */
export function CampaignPoller({ campaignId, isRunning, hasActiveCalls }: Props) {
  const router = useRouter()
  const inFlightRef = useRef(false)

  useEffect(() => {
    // Polling gerek yok mu?
    if (!isRunning && !hasActiveCalls) return

    const poll = async () => {
      if (inFlightRef.current) return
      inFlightRef.current = true

      try {
        // Running ise processor'u tetikle (yeni arama başlatabilir)
        if (isRunning) {
          await fetch(`/api/campaigns/${campaignId}/process`, { method: 'POST' })
            .catch(() => {})
        }

        // Her durumda sync-all tetikle (calling itemları güncelle)
        if (hasActiveCalls) {
          await fetch('/api/calls/sync-all', { method: 'POST' })
            .catch(() => {})
        }

        // UI yenile (campaign_items status'larını güncel görmek için)
        router.refresh()
      } finally {
        inFlightRef.current = false
      }
    }

    poll() // İlk tetikleme
    const interval = setInterval(poll, 8000) // 8sn

    return () => clearInterval(interval)
  }, [campaignId, isRunning, hasActiveCalls, router])

  return null
}
