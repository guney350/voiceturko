/**
 * Key Auto-Rotation Sistemi
 *
 * Bir API key $9.50 harcadığında (margin için $10'dan az):
 * 1. Key 'exhausted' olarak işaretlenir
 * 2. User'ın havuzundan çıkarılır
 * 3. Havuzdan boş bir key alınır ve user'a tahsis edilir
 * 4. User'ın SIP + Asistanı yeni key'e provision edilir
 * 5. Key rotation log'a yazılır
 *
 * Kullanıcı hiçbir şey fark etmez.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { VapiPoolManager } from './pool-manager'

const SPENDING_LIMIT_DEFAULT = 9.50 // $10 - $0.50 margin

export interface RotationResult {
  rotated: number
  failed: number
  details: Array<{
    userId: string
    oldKeyId: string
    newKeyId?: string
    success: boolean
    error?: string
  }>
}

export class KeyRotation {
  /**
   * Sistemdeki tüm exhausted key'leri tespit edip rotate eder.
   * Cron tarafından periyodik olarak çağrılır.
   *
   * GÜVENLİ: Aktif çağrı varsa o key beklenir, exhausted işaretlenir ama deaktif edilmez
   * Tüm çağrılar bittikten sonra rotation yapılır.
   */
  static async runRotationCycle(): Promise<RotationResult> {
    const supabase = createAdminClient()
    const result: RotationResult = { rotated: 0, failed: 0, details: [] }

    // 1. Spending limit'i aşmış key'leri bul
    // ONEMLI: status='exhausted' (eski bekleyen) key'leri de yakala - aktif call yoksa rotate
    const { data: exhaustedKeys } = await supabase
      .from('vapi_accounts')
      .select('id, total_spent, spending_limit, status, current_active_calls, is_active')
      .or('and(status.in.(active,standby),total_spent.gte.' + SPENDING_LIMIT_DEFAULT + '),and(status.eq.exhausted,current_active_calls.eq.0,is_active.eq.true)')

    if (!exhaustedKeys || exhaustedKeys.length === 0) {
      console.log('[KeyRotation] Rotate edilecek key yok')
      return result
    }

    console.log(`[KeyRotation] ${exhaustedKeys.length} exhausted key bulundu`)

    for (const key of exhaustedKeys) {
      // 1.1. AKTIF ÇAĞRI VARSA bekle, sadece status'u 'exhausted' yap, deaktif etme
      if ((key.current_active_calls || 0) > 0) {
        await supabase
          .from('vapi_accounts')
          .update({ status: 'exhausted' }) // is_active: true kalır, mevcut çağrılar biter
          .eq('id', key.id)

        console.log(`[KeyRotation] Key ${key.id.substring(0, 8)} aktif çağrılar bitince rotate edilecek (${key.current_active_calls} aktif)`)
        continue
      }

      // 1.2. Aktif çağrı yok - güvenle rotate et
      await supabase
        .from('vapi_accounts')
        .update({
          status: 'exhausted',
          is_active: false,
        })
        .eq('id', key.id)

      // 1.3. Bu key'e atanmış user'ları bul
      const { data: assignments } = await supabase
        .from('user_pool_assignments')
        .select('user_id')
        .eq('vapi_account_id', key.id)
        .eq('is_active', true)

      for (const assignment of assignments || []) {
        try {
          const rotationResult = await this.rotateUserKey(assignment.user_id, key.id, 'spending_limit_exceeded')
          result.details.push({
            userId: assignment.user_id,
            oldKeyId: key.id,
            newKeyId: rotationResult.newKeyId,
            success: rotationResult.success,
            error: rotationResult.error,
          })
          if (rotationResult.success) result.rotated++
          else result.failed++
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown'
          result.details.push({
            userId: assignment.user_id,
            oldKeyId: key.id,
            success: false,
            error: msg,
          })
          result.failed++
        }
      }
    }

    return result
  }

  /**
   * Bir user için exhausted key'i yenisiyle değiştir.
   * - Eski key user'ın havuzundan çıkar
   * - Havuzdan boş key bul
   * - SIP + Asistan kaynaklarını yeni key'e provision et
   */
  static async rotateUserKey(
    userId: string,
    oldKeyId: string,
    reason: string
  ): Promise<{ success: boolean; newKeyId?: string; error?: string; deferred?: boolean }> {
    const supabase = createAdminClient()

    // 1. Eski key'in spending + active call bilgisini al
    const { data: oldKey } = await supabase
      .from('vapi_accounts')
      .select('total_spent, current_active_calls')
      .eq('id', oldKeyId)
      .single()

    // GUVENLI: Aktif call varsa rotate ETME, sadece status=exhausted isaretle
    // Cron sonraki turda call'lar bittiyse rotate eder
    if ((oldKey?.current_active_calls || 0) > 0) {
      await supabase
        .from('vapi_accounts')
        .update({ status: 'exhausted' })
        .eq('id', oldKeyId)
      console.log(`[KeyRotation] Key ${oldKeyId.substring(0, 8)} aktif call var (${oldKey?.current_active_calls}), rotation ertelendi`)
      return { success: false, deferred: true, error: 'active_calls_in_progress' }
    }

    try {
      // 2. Eski atamayı deaktif et
      await supabase
        .from('user_pool_assignments')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('vapi_account_id', oldKeyId)

      // 3. User'ın eski key'deki tüm kaynaklarını deaktif et (cleanup)
      await supabase
        .from('vapi_resources')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('vapi_account_id', oldKeyId)

      // 4. Havuzdan boş key bul (henüz hiçbir user'a atanmamış, aktif)
      const { data: assignedKeyIds } = await supabase
        .from('user_pool_assignments')
        .select('vapi_account_id')
        .eq('is_active', true)

      const assignedSet = new Set((assignedKeyIds || []).map(a => a.vapi_account_id))

      const { data: availableKeys } = await supabase
        .from('vapi_accounts')
        .select('id')
        .eq('is_active', true)
        .in('status', ['active', 'standby'])
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(100)

      const freeKey = (availableKeys || []).find(k => !assignedSet.has(k.id))

      if (!freeKey) {
        // Havuzda boş key yok - admin'e bildirim gerek
        await this.logRotation(userId, oldKeyId, null, reason, oldKey?.total_spent, 0, false, 'Havuzda boş key yok')

        // Admin'e bildirim (audit log)
        await supabase.from('audit_logs').insert({
          action: 'pool_exhausted',
          status: 'failed',
          metadata: {
            user_id: userId,
            old_key_id: oldKeyId,
            reason: 'Havuzda kullanılabilir key kalmadı',
          },
        })

        return { success: false, error: 'POOL_EMPTY: Havuzda boş key yok' }
      }

      // 5. Yeni key'i user'a tahsis et
      await supabase.from('user_pool_assignments').insert({
        user_id: userId,
        vapi_account_id: freeKey.id,
        is_active: true,
      })

      // 6. SIP ve asistanı yeni key'e provision et
      let replicatedCount = 0
      let totalRequired = 0
      let provisionErrors: string[] = []

      // SIP'leri al
      const { data: sips } = await supabase
        .from('sips')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)

      for (const sip of sips || []) {
        totalRequired++
        try {
          const result = await VapiPoolManager.provisionSipTrunk(userId, {
            sipId: sip.id,
            name: sip.name,
            ipAddress: sip.ip_address,
            port: sip.port,
            username: sip.username,
            password: sip.password,
            phoneNumber: sip.phone_number || `+90${sip.username}`,
          })
          if (result.successful > 0) replicatedCount++
          else provisionErrors.push(`SIP ${sip.name}: ${result.warnings.join('; ')}`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'SIP provision hatası'
          provisionErrors.push(`SIP ${sip.name}: ${msg}`)
        }
      }

      // Asistanları al
      const { data: assistants } = await supabase
        .from('assistant')
        .select('id, name')
        .eq('user_id', userId)

      for (const ast of assistants || []) {
        totalRequired++
        try {
          const result = await VapiPoolManager.syncAssistant(userId, ast.id)
          if (result.successful > 0) replicatedCount++
          else provisionErrors.push(`Asistan ${ast.name}: ${result.warnings.join('; ')}`)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Asistan sync hatası'
          provisionErrors.push(`Asistan ${ast.name}: ${msg}`)
        }
      }

      // 7. Provision tamamen başarısızsa ROLLBACK
      if (totalRequired > 0 && replicatedCount === 0) {
        // Yeni key'i geri ver, eski assignment'ı tekrar aç
        await supabase
          .from('user_pool_assignments')
          .delete()
          .eq('user_id', userId)
          .eq('vapi_account_id', freeKey.id)

        await supabase
          .from('user_pool_assignments')
          .update({ is_active: true })
          .eq('user_id', userId)
          .eq('vapi_account_id', oldKeyId)

        await supabase
          .from('vapi_resources')
          .update({ is_active: true })
          .eq('user_id', userId)
          .eq('vapi_account_id', oldKeyId)

        const errorMsg = `PROVISION_FAILED: ${provisionErrors.join('; ')}`
        await this.logRotation(userId, oldKeyId, freeKey.id, reason, oldKey?.total_spent, 0, false, errorMsg)
        return { success: false, error: errorMsg }
      }

      // 8. Log
      await this.logRotation(userId, oldKeyId, freeKey.id, reason, oldKey?.total_spent, replicatedCount, true)

      console.log(`[KeyRotation] ✅ User ${userId.substring(0, 8)}: ${oldKeyId.substring(0, 8)} → ${freeKey.id.substring(0, 8)} (${replicatedCount}/${totalRequired} resource)`)

      return { success: true, newKeyId: freeKey.id }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown'
      await this.logRotation(userId, oldKeyId, null, reason, oldKey?.total_spent, 0, false, msg)
      return { success: false, error: msg }
    }
  }

  /**
   * Rotation log
   */
  private static async logRotation(
    userId: string,
    oldKeyId: string,
    newKeyId: string | null,
    reason: string,
    oldSpent: number | null | undefined,
    resourcesReplicated: number,
    success: boolean,
    errorMessage?: string
  ) {
    const supabase = createAdminClient()
    await supabase.from('key_rotation_logs').insert({
      user_id: userId,
      old_account_id: oldKeyId,
      new_account_id: newKeyId,
      reason,
      old_spent: oldSpent || 0,
      resources_replicated: resourcesReplicated,
      success,
      error_message: errorMessage || null,
    })
  }

  /**
   * VAPI'den son spending bilgisini çek (drift düzeltme için)
   */
  /**
   * VAPI'den gercek spending bilgisini cek (drift duzeltme).
   * Hem VAPI call list'i hem DB'den maxini alir (en yuksek = gercek).
   */
  static async syncSpendingFromCalls(): Promise<{ synced: number; exhausted: number }> {
    const supabase = createAdminClient()

    const { data: accounts } = await supabase
      .from('vapi_accounts')
      .select('id, api_key, total_spent, spending_limit')
      .eq('is_active', true)

    let synced = 0
    let exhausted = 0

    // 8'li paralel batch (rate limit'e dikkat)
    const list = accounts || []
    for (let i = 0; i < list.length; i += 8) {
      const batch = list.slice(i, i + 8)
      await Promise.allSettled(batch.map(async (acc) => {
        // 1) VAPI'den toplam cost (gercek)
        let vapiSpent = 0
        try {
          let createdAtLe: string | undefined
          for (let page = 0; page < 5; page++) {
            const params = new URLSearchParams({ limit: '1000' })
            if (createdAtLe) params.set('createdAtLe', createdAtLe)
            const res = await fetch(`https://api.vapi.ai/call?${params.toString()}`, {
              headers: { Authorization: `Bearer ${acc.api_key}` }
            })
            if (!res.ok) break
            const calls = await res.json()
            if (!Array.isArray(calls) || calls.length === 0) break
            for (const c of calls) vapiSpent += parseFloat(c.cost) || 0
            if (calls.length < 1000) break
            createdAtLe = calls[calls.length - 1].createdAt
            if (!createdAtLe) break
          }
        } catch {}

        // 2) DB'den cost (yedek)
        const { data: costData } = await supabase
          .from('calls')
          .select('cost')
          .eq('vapi_account_id', acc.id)
          .not('cost', 'is', null)
        const dbSpent = (costData || []).reduce(
          (s, c) => s + (parseFloat(c.cost as unknown as string) || 0),
          0
        )

        const realSpent = Math.max(vapiSpent, dbSpent)
        const currentSpent = parseFloat(acc.total_spent as unknown as string) || 0

        if (Math.abs(realSpent - currentSpent) > 0.001) {
          const updatePayload: Record<string, unknown> = { total_spent: realSpent }
          if (realSpent >= (parseFloat(acc.spending_limit as unknown as string) || 9.50)) {
            updatePayload.status = 'exhausted'
            exhausted++
          }
          await supabase
            .from('vapi_accounts')
            .update(updatePayload)
            .eq('id', acc.id)
          synced++
        }
      }))
    }

    return { synced, exhausted }
  }
}
