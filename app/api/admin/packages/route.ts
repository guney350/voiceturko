/**
 * Admin Packages API
 * minute_packages tablosu icin tam CRUD.
 * Admin cookie auth + service role (RLS bypass).
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function verifyAdmin() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_session')?.value === 'verified'
}

export async function GET() {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('minute_packages')
    .select('*')
    .order('display_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const payload = {
      name: String(body.name || '').trim(),
      minutes: parseInt(body.minutes) || 0,
      price_per_minute: parseFloat(body.price_per_minute) || 0,
      currency: body.currency || 'TRY',
      display_order: parseInt(body.display_order) || 0,
      is_active: body.is_active !== false,
      is_featured: !!body.is_featured,
      description: body.description || '',
    }

    if (!payload.name) {
      return NextResponse.json({ error: 'Isim zorunlu' }, { status: 400 })
    }
    if (payload.price_per_minute <= 0) {
      return NextResponse.json({ error: 'Dakika basina fiyat 0 olamaz' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('minute_packages')
      .insert(payload)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Hata'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const body = await request.json()
    const { id, ...updates } = body
    if (!id) {
      return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
    }

    const payload: Record<string, unknown> = {}
    if (updates.name !== undefined) payload.name = String(updates.name).trim()
    if (updates.minutes !== undefined) payload.minutes = parseInt(updates.minutes) || 0
    if (updates.price_per_minute !== undefined) {
      const p = parseFloat(updates.price_per_minute)
      if (isNaN(p) || p <= 0) {
        return NextResponse.json({ error: 'Dakika basina fiyat 0\'dan buyuk olmali' }, { status: 400 })
      }
      payload.price_per_minute = p
    }
    if (updates.currency !== undefined) payload.currency = updates.currency
    if (updates.display_order !== undefined) payload.display_order = parseInt(updates.display_order) || 0
    if (updates.is_active !== undefined) payload.is_active = !!updates.is_active
    if (updates.is_featured !== undefined) payload.is_featured = !!updates.is_featured
    if (updates.description !== undefined) payload.description = updates.description || ''

    payload.updated_at = new Date().toISOString()

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('minute_packages')
      .update(payload)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Paket bulunamadi' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Hata'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Kullanan kullanici var mi? Varsa soft delete (is_active=false)
  const { count: purchases } = await supabase
    .from('package_purchases')
    .select('id', { count: 'exact', head: true })
    .eq('package_id', id)
  const { count: balances } = await supabase
    .from('user_balances')
    .select('user_id', { count: 'exact', head: true })
    .eq('package_id', id)

  const hasUsers = (purchases || 0) > 0 || (balances || 0) > 0

  if (hasUsers) {
    // Soft delete - kullaniciyi etkilemez
    const { error } = await supabase
      .from('minute_packages')
      .update({ is_active: false })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, softDelete: true, message: 'Paket pasiflestirildi (kullanan kullanici var)' })
  }

  // Tam silme
  const { error } = await supabase
    .from('minute_packages')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
