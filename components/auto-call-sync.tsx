'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * AutoCallSync - Sessiz arka plan polling (v2 - Aggressive Mode)
 *
 * Yaptığı işler (her 12 saniyede bir, sessizce):
 * 1. Aktif kampanya varsa → sync-all (transcript/summary çek)
 * 2. Son 2 saat içinde transcript'i boş herhangi bir arama varsa → sync-all
 * 3. Son 24 saat içinde webhook_processed_at NULL olan arama varsa → sync-all
 *
 * Hiç görünüm yok - tamamen sessiz çalışır.
 * Dashboard layout'una eklenir → tüm sayfalarda aktif.
 *
 * Bu sayede VAPI webhook'u gelmese bile (localhost/dev veya VAPI gecikmesi)
 * tüm arama verileri (transcript, summary, süre) güncel kalır.
 */
export function AutoCallSync() {
  const supabase = createClient()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    let mounted = true

    const checkAndSync = async () => {
      if (inFlightRef.current) return
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !mounted) return

        const now = Date.now()
        const since2h = new Date(now - 2 * 60 * 60 * 1000).toISOString()
        const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString()

        // Üç paralel check
        const [activeCampaigns, missingTranscript, unprocessedHooks] = await Promise.all([
          supabase
            .from('campaigns')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'running'),
          supabase
            .from('calls')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .is('transcript', null)
            .gt('created_at', since2h),
          supabase
            .from('calls')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .is('webhook_processed_at', null)
            .gt('created_at', since24h),
        ])

        const hasWork =
          (activeCampaigns.count || 0) > 0 ||
          (missingTranscript.count || 0) > 0 ||
          (unprocessedHooks.count || 0) > 0

        if (!hasWork || !mounted) return

        inFlightRef.current = true
        try {
          await fetch('/api/calls/sync-all', { method: 'POST' })
        } catch {
          // sessiz
        } finally {
          inFlightRef.current = false
        }
      } catch {
        // sessiz
      }
    }

    // İlk tetikleme (sayfa acilir acilmaz)
    checkAndSync()

    // 30 saniyede bir (asiri yuk yapmayacak, ama gec degil)
    // Tab visibility ile birlestirir: arka planda olan tab polleme
    intervalRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      checkAndSync()
    }, 30000)

    return () => {
      mounted = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [supabase])

  return null
}
