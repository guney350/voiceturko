/**
 * Admin Pool Management API
 * VAPI API key havuzunu yönetir — harcama bazlı sistem.
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function verifyAdmin() {
  const cookieStore = await cookies()
  const adminSession = cookieStore.get('admin_session')?.value
  return adminSession === 'verified'
}

export async function GET() {
  try {
    if (!await verifyAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()

    const { data: keys } = await supabase
      .from('vapi_accounts')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })

    if (!keys) {
      return NextResponse.json({ success: true, stats: { totalKeys: 0, activeKeys: 0, totalInitialBalance: 0, totalSpent: 0, totalRemaining: 0 }, keys: [] })
    }

    // Hangi key hangi kullanıcılara bağlı?
    const { data: resourceLinks } = await supabase
      .from('vapi_resources')
      .select('vapi_account_id, user_id')
      .eq('is_active', true)

    const keyUserMap = new Map<string, Set<string>>()
    for (const r of (resourceLinks || [])) {
      if (!keyUserMap.has(r.vapi_account_id)) keyUserMap.set(r.vapi_account_id, new Set())
      keyUserMap.get(r.vapi_account_id)!.add(r.user_id)
    }

    // Kullanıcı email'lerini çek
    const allUserIds = new Set<string>()
    for (const s of keyUserMap.values()) s.forEach(id => allUserIds.add(id))

    const userEmailMap = new Map<string, string>()
    if (allUserIds.size > 0) {
      for (const uid of allUserIds) {
        try {
          const { data } = await supabase.auth.admin.getUserById(uid)
          if (data?.user?.email) userEmailMap.set(uid, data.user.email)
        } catch { /* skip */ }
      }
    }

    const totalInitialBalance = keys.reduce((s, k) => s + (parseFloat(k.initial_balance) || 0), 0)
    const totalSpent = keys.reduce((s, k) => s + (parseFloat(k.total_spent) || 0), 0)

    const enrichedKeys = keys.map(key => {
      const initialBalance = parseFloat(key.initial_balance) || 10
      const totalSpentVal = parseFloat(key.total_spent) || 0
      const spendingLimit = parseFloat(key.spending_limit) || 9.50
      const remaining = initialBalance - totalSpentVal
      const assignedUserIds = keyUserMap.get(key.id)
      const assignedCount = assignedUserIds?.size || 0
      const isAssigned = assignedCount > 0

      const assignedEmails: string[] = []
      if (assignedUserIds) {
        for (const uid of assignedUserIds) {
          assignedEmails.push(userEmailMap.get(uid) || uid.substring(0, 8) + '...')
        }
      }

      return {
        ...key,
        api_key_masked: `${key.api_key.substring(0, 8)}...${key.api_key.substring(key.api_key.length - 4)}`,
        assigned_users: assignedCount,
        assigned_emails: assignedEmails,
        is_assigned: isAssigned,
        initial_balance: initialBalance,
        total_spent: totalSpentVal,
        spending_limit: spendingLimit,
        remaining,
        spent_percent: initialBalance > 0 ? (totalSpentVal / initialBalance) * 100 : 0,
        is_exhausted: totalSpentVal >= spendingLimit,
        is_low_balance: remaining < 2.00,
      }
    })

    const assignedKeys = enrichedKeys.filter(k => k.is_assigned && k.is_active)

    return NextResponse.json({
      success: true,
      stats: {
        totalKeys: keys.length,
        activeKeys: assignedKeys.length,
        standbyKeys: keys.filter(k => k.is_active && !enrichedKeys.find(e => e.id === k.id)?.is_assigned).length,
        totalInitialBalance,
        totalSpent,
        totalRemaining: totalInitialBalance - totalSpent,
      },
      keys: enrichedKeys,
    })
  } catch (error) {
    console.error('[Admin Pool API] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!await verifyAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (body.action === 'import') {
      return handleImport(body.accounts)
    }

    if (body.action === 'sync_spending') {
      return handleSyncSpending(body.accountId)
    }

    if (body.action === 'update_spending_limit') {
      return handleUpdateSpendingLimit(body.spendingLimit)
    }

    if (body.action === 'activate') {
      return handleActivate(body.id)
    }

    if (body.action === 'bulk_delete') {
      return handleBulkDelete(body.ids)
    }

    if (body.action === 'export') {
      return handleExport()
    }

    if (body.action === 'bulk_sync') {
      return handleBulkSync(body.ids)
    }

    if (body.action === 'key_detail') {
      return handleKeyDetail(body.id)
    }

    const { apiKey, email, password, initialBalance, spendingLimit } = body

    if (!apiKey) {
      return NextResponse.json({ error: 'apiKey zorunludur' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('vapi_accounts')
      .insert({
        api_key: apiKey,
        email: email || null,
        password: password || null,
        status: 'active',
        is_active: true,
        initial_balance: initialBalance || 10.00,
        total_spent: 0,
        spending_limit: spendingLimit || 9.50,
        max_concurrent_calls: 10,
        current_active_calls: 0,
        priority: 100,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Bu API key zaten havuzda mevcut' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[Admin Pool API] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!await verifyAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, label, notes, maxConcurrentCalls, isActive, status, priority, spendingLimit, initialBalance } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const updateData: Record<string, unknown> = {}
    if (label !== undefined) updateData.label = label
    if (notes !== undefined) updateData.notes = notes
    if (maxConcurrentCalls !== undefined) updateData.max_concurrent_calls = maxConcurrentCalls
    if (isActive !== undefined) updateData.is_active = isActive
    if (status !== undefined) updateData.status = status
    if (priority !== undefined) updateData.priority = priority
    if (spendingLimit !== undefined) updateData.spending_limit = spendingLimit
    if (initialBalance !== undefined) updateData.initial_balance = initialBalance

    const { error } = await supabase
      .from('vapi_accounts')
      .update(updateData)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Pool API] PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!await verifyAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const supabase = createAdminClient()
    await deleteAccountsByIds(supabase, [id])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Admin Pool API] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleImport(accounts: Array<{ email: string; password: string; apiKey: string }>) {
  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ error: 'Hesap listesi boş' }, { status: 400 })
  }

  const supabase = createAdminClient()
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (const acc of accounts) {
    if (!acc.apiKey || acc.apiKey.length < 20) {
      skipped++
      continue
    }

    const { error } = await supabase
      .from('vapi_accounts')
      .insert({
        api_key: acc.apiKey.trim(),
        email: acc.email?.trim() || null,
        password: acc.password?.trim() || null,
        status: 'active',
        is_active: true,
        initial_balance: 10.00,
        total_spent: 0,
        spending_limit: 9.50,
        max_concurrent_calls: 10,
        current_active_calls: 0,
        priority: 100 + imported,
      })

    if (error) {
      if (error.code === '23505') skipped++
      else errors.push(`${acc.email || acc.apiKey.substring(0, 8)}: ${error.message}`)
    } else {
      imported++
    }
  }

  return NextResponse.json({ success: true, imported, skipped, errors })
}

/**
 * VAPI'den GERCEK harcama miktarini cek.
 * VAPI'nin call list endpoint'inden tum cost'lari toplar.
 * - DB'deki calls.cost'a guvenmez (cunku sync miss / reset olabilir)
 * - VAPI'nin kendi cost verisinin toplami = gercek harcama
 */
async function fetchTotalSpentFromVapi(apiKey: string): Promise<{ total: number; invalid: boolean }> {
  try {
    let total = 0
    let createdAtLe: string | undefined
    let firstStatus = 0
    // VAPI pagination yok - limit 1000 ile en cok son 1000 cagri (genelde yeterli)
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({ limit: '1000' })
      if (createdAtLe) params.set('createdAtLe', createdAtLe)

      const res = await fetch(`https://api.vapi.ai/call?${params.toString()}`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      })
      if (page === 0) firstStatus = res.status
      if (!res.ok) break

      const calls = await res.json()
      if (!Array.isArray(calls) || calls.length === 0) break

      for (const c of calls) {
        total += parseFloat(c.cost) || 0
      }

      if (calls.length < 1000) break
      createdAtLe = calls[calls.length - 1].createdAt
      if (!createdAtLe) break
    }

    // 401/403 = key gecersiz/iptal edilmis
    const invalid = firstStatus === 401 || firstStatus === 403
    return { total: Math.round(total * 10000) / 10000, invalid }
  } catch {
    return { total: 0, invalid: false }
  }
}

async function handleSyncSpending(accountId?: string) {
  const supabase = createAdminClient()

  if (accountId) {
    // Tek key sync - VAPI'den GERCEK harcamayi cek
    const { data: account } = await supabase
      .from('vapi_accounts')
      .select('id, api_key, initial_balance, spending_limit')
      .eq('id', accountId)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Hesap bulunamadi' }, { status: 404 })
    }

    const { total: vapiSpent, invalid } = await fetchTotalSpentFromVapi(account.api_key)

    // DB'deki cost toplaminin maxini al (drift'i yakala)
    const { data: costData } = await supabase
      .from('calls')
      .select('cost')
      .eq('vapi_account_id', accountId)
      .not('cost', 'is', null)
    const dbSpent = (costData || []).reduce((s, c) => s + (parseFloat(c.cost) || 0), 0)
    const totalSpent = Math.max(vapiSpent, dbSpent)

    const updatePayload: Record<string, unknown> = { total_spent: totalSpent }
    if (invalid) {
      // Key gecersiz/iptal edilmis (401/403) - sistemden cikar
      updatePayload.status = 'disabled'
      updatePayload.is_active = false
    } else if (totalSpent >= (parseFloat(account.spending_limit) || 9.50)) {
      updatePayload.status = 'exhausted'
    }

    await supabase
      .from('vapi_accounts')
      .update(updatePayload)
      .eq('id', accountId)

    const remaining = (parseFloat(account.initial_balance) || 10) - totalSpent

    return NextResponse.json({
      success: true,
      totalSpent,
      remaining,
      invalid,
      source: vapiSpent > 0 ? 'vapi' : 'db',
      vapiSpent,
      dbSpent,
    })
  }

  // Tum hesaplar - PARALEL bulk sync (cok daha hizli)
  const { data: accounts } = await supabase
    .from('vapi_accounts')
    .select('id, api_key, initial_balance, spending_limit')
    .eq('is_active', true)

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ success: true, synced: 0 })
  }

  // 8'li paralel batch (rate limit'e dikkat)
  let synced = 0
  let exhausted = 0
  let invalidated = 0
  for (let i = 0; i < accounts.length; i += 8) {
    const batch = accounts.slice(i, i + 8)
    await Promise.allSettled(batch.map(async (acc) => {
      const { total: vapiSpent, invalid } = await fetchTotalSpentFromVapi(acc.api_key)
      const { data: costData } = await supabase
        .from('calls')
        .select('cost')
        .eq('vapi_account_id', acc.id)
        .not('cost', 'is', null)
      const dbSpent = (costData || []).reduce((s, c) => s + (parseFloat(c.cost) || 0), 0)
      const totalSpent = Math.max(vapiSpent, dbSpent)

      const updatePayload: Record<string, unknown> = { total_spent: totalSpent }
      if (invalid) {
        updatePayload.status = 'disabled'
        updatePayload.is_active = false
        invalidated++
      } else if (totalSpent >= (parseFloat(acc.spending_limit) || 9.50)) {
        updatePayload.status = 'exhausted'
        exhausted++
      }
      await supabase.from('vapi_accounts').update(updatePayload).eq('id', acc.id)
      synced++
    }))
  }

  return NextResponse.json({ success: true, synced, exhausted, invalidated, total: accounts.length })
}

async function handleUpdateSpendingLimit(spendingLimit: number) {
  if (!spendingLimit || spendingLimit <= 0) {
    return NextResponse.json({ error: 'Geçersiz limit' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('vapi_accounts')
    .update({ spending_limit: spendingLimit })
    .neq('status', 'disabled')

  if (error) throw error

  return NextResponse.json({ success: true })
}

async function handleActivate(id: string) {
  if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })

  const supabase = createAdminClient()

  await supabase
    .from('vapi_accounts')
    .update({ is_current: false })
    .neq('id', id)

  const { error } = await supabase
    .from('vapi_accounts')
    .update({ is_current: true, is_active: true, status: 'active' })
    .eq('id', id)

  if (error) throw error

  return NextResponse.json({ success: true })
}

async function handleBulkDelete(ids: string[]) {
  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: 'Silinecek hesap yok' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const deleted = await deleteAccountsByIds(supabase, ids)

  return NextResponse.json({ success: true, deleted })
}

async function deleteAccountsByIds(supabase: ReturnType<typeof createAdminClient>, ids: string[]) {
  if (ids.length === 0) return 0

  // FK bağımlılıklarını paralel temizle
  await Promise.all([
    supabase.from('vapi_resources').delete().in('vapi_account_id', ids),
    supabase.from('pool_usage_logs').delete().in('vapi_account_id', ids),
    supabase.from('assistant_account_mapping').delete().in('vapi_account_id', ids),
    supabase.from('vapi_balance_logs_archived').update({ account_id: null }).in('account_id', ids),
    supabase.from('vapi_account_switch_logs').update({ from_account_id: null }).in('from_account_id', ids),
    supabase.from('vapi_account_switch_logs').update({ to_account_id: null }).in('to_account_id', ids),
    supabase.from('calls').update({ vapi_account_id: null }).in('vapi_account_id', ids),
    supabase.from('sips').update({ vapi_account_id: null }).in('vapi_account_id', ids),
    supabase.from('campaign_items').update({ vapi_account_id: null }).in('vapi_account_id', ids),
  ])

  const { error } = await supabase.from('vapi_accounts').delete().in('id', ids)
  if (error) throw error

  return ids.length
}

async function handleExport() {
  const supabase = createAdminClient()

  const { data: accounts } = await supabase
    .from('vapi_accounts')
    .select('email, password, api_key')
    .order('created_at', { ascending: true })

  const lines = (accounts || []).map(a => {
    const emailLine = a.email && a.password ? `${a.email}:${a.password}` : (a.email || '')
    return emailLine ? `${emailLine}\n${a.api_key}` : a.api_key
  })

  return NextResponse.json({ success: true, content: lines.join('\n') })
}

async function handleBulkSync(ids: string[]) {
  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: 'Senkronize edilecek hesap yok' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: accounts } = await supabase
    .from('vapi_accounts')
    .select('id, api_key, initial_balance, spending_limit')
    .in('id', ids)

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ success: true, synced: 0 })
  }

  let synced = 0
  let exhausted = 0
  let invalidated = 0
  const errors: string[] = []

  // 8'li paralel batch
  for (let i = 0; i < accounts.length; i += 8) {
    const batch = accounts.slice(i, i + 8)
    await Promise.allSettled(batch.map(async (acc) => {
      try {
        const { total: vapiSpent, invalid } = await fetchTotalSpentFromVapi(acc.api_key)
        const { data: costData } = await supabase
          .from('calls')
          .select('cost')
          .eq('vapi_account_id', acc.id)
          .not('cost', 'is', null)
        const dbSpent = (costData || []).reduce((s, c) => s + (parseFloat(c.cost) || 0), 0)
        const totalSpent = Math.max(vapiSpent, dbSpent)

        const updatePayload: Record<string, unknown> = { total_spent: totalSpent }
        if (invalid) {
          updatePayload.status = 'disabled'
          updatePayload.is_active = false
          invalidated++
        } else if (totalSpent >= (parseFloat(acc.spending_limit) || 9.50)) {
          updatePayload.status = 'exhausted'
          exhausted++
        }
        await supabase.from('vapi_accounts').update(updatePayload).eq('id', acc.id)
        synced++
      } catch (err) {
        errors.push(`${acc.id.substring(0, 8)}: ${err instanceof Error ? err.message : 'Unknown'}`)
      }
    }))
  }

  return NextResponse.json({ success: true, synced, exhausted, invalidated, total: accounts.length, errors: errors.length > 0 ? errors : undefined })
}

async function handleKeyDetail(id: string) {
  if (!id) return NextResponse.json({ error: 'id zorunludur' }, { status: 400 })

  const supabase = createAdminClient()

  const { data: account } = await supabase
    .from('vapi_accounts')
    .select('*')
    .eq('id', id)
    .single()

  if (!account) return NextResponse.json({ error: 'Hesap bulunamadı' }, { status: 404 })

  // Atanmış user'ları + email'leri çek
  const { data: assignments } = await supabase
    .from('user_pool_assignments')
    .select('user_id')
    .eq('vapi_account_id', id)
    .eq('is_active', true)

  const assignedUsers: Array<{ id: string; email: string; assignedAt?: string }> = []
  for (const a of assignments || []) {
    try {
      const { data } = await supabase.auth.admin.getUserById(a.user_id)
      if (data?.user?.email) {
        assignedUsers.push({ id: a.user_id, email: data.user.email })
      }
    } catch {}
  }

  // Son 10 arama
  const { data: recentCalls } = await supabase
    .from('calls')
    .select('id, vapi_call_id, customer_name, customer_number, duration_seconds, cost, status, ended_reason, created_at')
    .eq('vapi_account_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Rotation history
  const { data: rotations } = await supabase
    .from('key_rotation_logs')
    .select('*')
    .or(`old_account_id.eq.${id},new_account_id.eq.${id}`)
    .order('rotated_at', { ascending: false })
    .limit(5)

  // VAPI'deki kaynak sayıları
  const { count: vapiResourceCount } = await supabase
    .from('vapi_resources')
    .select('id', { count: 'exact', head: true })
    .eq('vapi_account_id', id)
    .eq('is_active', true)

  // Son 7 günlük günlük harcama
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: dailyCalls } = await supabase
    .from('calls')
    .select('cost, created_at')
    .eq('vapi_account_id', id)
    .not('cost', 'is', null)
    .gte('created_at', since)

  const dailySpend: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    dailySpend[date] = 0
  }
  for (const c of dailyCalls || []) {
    const date = (c.created_at as string).slice(0, 10)
    dailySpend[date] = (dailySpend[date] || 0) + (parseFloat(c.cost) || 0)
  }

  return NextResponse.json({
    success: true,
    account,
    assignedUsers,
    recentCalls: recentCalls || [],
    rotations: rotations || [],
    vapiResourceCount: vapiResourceCount || 0,
    dailySpend,
  })
}
