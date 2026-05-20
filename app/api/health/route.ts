/**
 * Health check endpoint - Monitoring için
 * GET /api/health
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const checks: Record<string, { ok: boolean; latency?: number; error?: string }> = {}
  const startTime = Date.now()

  // Supabase DB check
  const supaStart = Date.now()
  try {
    const sb = createAdminClient()
    const { error } = await sb.from('minute_packages').select('id', { count: 'exact', head: true }).limit(1)
    checks.database = {
      ok: !error,
      latency: Date.now() - supaStart,
      error: error?.message,
    }
  } catch (e) {
    checks.database = {
      ok: false,
      latency: Date.now() - supaStart,
      error: e instanceof Error ? e.message : 'Unknown',
    }
  }

  // VAPI API reachability
  const vapiStart = Date.now()
  try {
    const sb = createAdminClient()
    const { data: anyKey } = await sb
      .from('vapi_accounts')
      .select('api_key')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (anyKey?.api_key) {
      const res = await fetch('https://api.vapi.ai/call?limit=1', {
        headers: { Authorization: `Bearer ${anyKey.api_key}` },
        signal: AbortSignal.timeout(5000),
      })
      checks.vapi_api = {
        ok: res.ok,
        latency: Date.now() - vapiStart,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      }
    } else {
      checks.vapi_api = { ok: false, error: 'No active VAPI keys in pool' }
    }
  } catch (e) {
    checks.vapi_api = {
      ok: false,
      latency: Date.now() - vapiStart,
      error: e instanceof Error ? e.message : 'Unknown',
    }
  }

  // Environment variables check
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ADMIN_PASSWORD',
    'CRON_SECRET',
  ]
  const missing = requiredEnvVars.filter(v => !process.env[v])
  checks.env = {
    ok: missing.length === 0,
    error: missing.length > 0 ? `Missing: ${missing.join(', ')}` : undefined,
  }

  const allOk = Object.values(checks).every(c => c.ok)
  const totalLatency = Date.now() - startTime

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      latency_ms: totalLatency,
      checks,
    },
    { status: allOk ? 200 : 503 }
  )
}
