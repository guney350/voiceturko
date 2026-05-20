'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  RefreshCw, Phone, Search, Download, Trash2, FileText,
  PhoneIncoming, ExternalLink, Clock,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface Call {
  id: string
  vapi_call_id: string | null
  customer_name: string | null
  customer_number: string | null
  duration_minutes: number | null
  duration_seconds: number | null
  status: string | null
  ended_reason: string | null
  summary: string | null
  transcript: string | null
  recording_url: string | null
  audio: string | null
  cost: number | string | null
  created_at: string
  call_type: string | null
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return `${m}dk ${s}s`
}

function getStatusInfo(status: string | null, endedReason: string | null) {
  if (!status) return { label: 'Bilinmiyor', className: 'bg-gray-100 text-gray-700' }
  switch (status) {
    case 'ended':
    case 'completed':
      if (endedReason?.includes('error') || endedReason?.includes('failed')) {
        return { label: 'Başarısız', className: 'bg-red-100 text-red-700 border-red-300' }
      }
      return { label: 'Tamamlandı', className: 'bg-emerald-100 text-emerald-700 border-emerald-300' }
    case 'in-progress':
    case 'ringing':
      return { label: 'Devam Ediyor', className: 'bg-blue-100 text-blue-700 border-blue-300 animate-pulse' }
    case 'queued':
      return { label: 'Kuyrukta', className: 'bg-gray-100 text-gray-700' }
    case 'failed':
      return { label: 'Başarısız', className: 'bg-red-100 text-red-700 border-red-300' }
    default:
      return { label: status, className: 'bg-gray-100 text-gray-700' }
  }
}

export default function CallsPage() {
  const supabase = createClient()
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'delete' | null>(null)
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const [processing, setProcessing] = useState(false)

  const loadCalls = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('calls')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500)

    setCalls((data as Call[]) || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadCalls() }, [loadCalls])

  // Stats
  const stats = {
    total: calls.length,
    successful: calls.filter(c => (c.status === 'ended' || c.status === 'completed') && !c.ended_reason?.includes('error')).length,
    totalMinutes: calls.reduce((s, c) => s + (parseFloat(String(c.duration_minutes || 0))), 0),
    withSummary: calls.filter(c => c.summary && c.summary.length > 10).length,
  }

  // Filter
  const filtered = calls.filter(c => {
    if (statusFilter !== 'all') {
      if (statusFilter === 'success' && (c.status !== 'ended' && c.status !== 'completed')) return false
      if (statusFilter === 'failed' && c.status !== 'failed' && !c.ended_reason?.includes('error')) return false
      if (statusFilter === 'in-progress' && c.status !== 'in-progress' && c.status !== 'ringing') return false
    }
    if (search) {
      const q = search.toLowerCase()
      return (
        (c.customer_name || '').toLowerCase().includes(q) ||
        (c.customer_number || '').includes(q) ||
        (c.summary || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(c => c.id)))
  }
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const r = await fetch('/api/calls/sync-all', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Senkronizasyon hatası')

      const synced = d.synced || 0
      const forceFixed = d.forceFixed || 0
      const transcriptFilled = d.transcriptFilled || 0
      const stillActive = d.stillActive || 0

      if (synced + forceFixed + transcriptFilled === 0 && stillActive === 0) {
        toast.info('Güncellenmesi gereken arama bulunamadı')
      } else {
        const parts = []
        if (synced > 0) parts.push(`${synced} arama güncellendi`)
        if (transcriptFilled > 0) parts.push(`${transcriptFilled} transkript dolduruldu`)
        if (forceFixed > 0) parts.push(`${forceFixed} sabit kalan düzeltildi`)
        if (stillActive > 0) parts.push(`${stillActive} hâlâ devam ediyor`)
        toast.success(parts.join(' · '))
      }
      await loadCalls()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setSyncing(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    setProcessing(true)
    try {
      const ids = Array.from(selected)
      const r = await fetch('/api/calls/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Silinemedi')
      toast.success(`${d.deleted || ids.length} çağrı silindi`)
      setSelected(new Set())
      setBulkAction(null)
      await loadCalls()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setProcessing(false)
    }
  }

  const exportExcel = async () => {
    if (selected.size === 0 && filtered.length === 0) return
    setExporting('excel')
    try {
      const XLSX = await import('xlsx')
      const targets = selected.size > 0
        ? filtered.filter(c => selected.has(c.id))
        : filtered

      const rows = targets.map((c, i) => {
        const statusInfo = getStatusInfo(c.status, c.ended_reason)
        return {
          '#': i + 1,
          'Tarih': new Date(c.created_at).toLocaleString('tr-TR'),
          'Müşteri Adı': c.customer_name || '—',
          'Telefon': c.customer_number || '—',
          'Yön': c.call_type === 'inboundPhoneCall' ? 'Gelen' : 'Giden',
          'Durum': statusInfo.label,
          'Bitiş Sebebi': c.ended_reason || '—',
          'Süre': formatDuration(c.duration_seconds),
          'Dakika': parseFloat(String(c.duration_minutes || 0)).toFixed(2),
          'Özet': c.summary || '—',
        }
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [
        { wch: 5 }, { wch: 22 }, { wch: 25 }, { wch: 18 }, { wch: 8 },
        { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 80 },
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Çağrılar')

      const fileName = `cagrilar-${new Date().toISOString().slice(0, 10)}.xlsx`
      XLSX.writeFile(wb, fileName)
      toast.success(`${targets.length} çağrı Excel olarak indirildi`)
    } catch (e: unknown) {
      toast.error('Excel oluşturulamadı: ' + (e instanceof Error ? e.message : ''))
    } finally {
      setExporting(null)
    }
  }

  const exportPDF = async () => {
    if (selected.size === 0 && filtered.length === 0) return
    setExporting('pdf')
    try {
      const targets = selected.size > 0
        ? filtered.filter(c => selected.has(c.id))
        : filtered

      const win = window.open('', '_blank')
      if (!win) {
        toast.error('PDF için pop-up engelleyiciyi devre dışı bırakın')
        return
      }

      const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

      const rowsHtml = targets.map((c, i) => {
        const st = getStatusInfo(c.status, c.ended_reason)
        const stClass = st.label.toLowerCase().includes('tamam') ? 'ok' : st.label.toLowerCase().includes('başarı') ? 'fail' : 'other'
        return `<tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(new Date(c.created_at).toLocaleString('tr-TR'))}</td>
          <td>${escapeHtml(c.customer_name || '—')}</td>
          <td>${escapeHtml(c.customer_number || '—')}</td>
          <td><span class="status ${stClass}">${escapeHtml(st.label)}</span></td>
          <td>${escapeHtml(formatDuration(c.duration_seconds))}</td>
          <td class="summary">${escapeHtml(c.summary || '—')}</td>
        </tr>`
      }).join('')

      const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Çağrı Raporu - ${new Date().toLocaleDateString('tr-TR')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Inter', 'Segoe UI', sans-serif; padding: 24px; color: #1a1a1a; font-size: 11pt; }
  h1 { font-size: 22pt; margin: 0 0 4px; color: #111; }
  .header { border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 24px; }
  .stats { display: flex; gap: 20px; font-size: 10pt; color: #555; margin-top: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { background: #2563eb; color: white; text-align: left; padding: 8px; font-weight: 600; }
  td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) { background: #f9fafb; }
  .summary { color: #444; line-height: 1.5; max-width: 400px; }
  .status { padding: 2px 6px; border-radius: 3px; font-size: 9pt; font-weight: 600; }
  .status.ok { background: #d1fae5; color: #065f46; }
  .status.fail { background: #fee2e2; color: #991b1b; }
  .status.other { background: #e5e7eb; color: #374151; }
  .footer { margin-top: 24px; text-align: center; color: #888; font-size: 9pt; }
  @media print { body { padding: 12px; } .no-print { display: none; } }
</style>
</head>
<body>
  <div class="header">
    <h1>Çağrı Raporu</h1>
    <div class="stats">
      <span><strong>Toplam:</strong> ${targets.length} çağrı</span>
      <span><strong>Tarih:</strong> ${new Date().toLocaleString('tr-TR')}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Tarih</th>
        <th>Müşteri</th>
        <th>Telefon</th>
        <th>Durum</th>
        <th>Süre</th>
        <th>Özet</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="footer">Voiceturko Portal · ${new Date().toLocaleDateString('tr-TR')}</div>
  <script>window.onload = () => { setTimeout(() => window.print(), 300); }</script>
</body>
</html>`

      win.document.write(html)
      win.document.close()
      toast.success(`${targets.length} çağrı PDF olarak hazırlandı`)
    } catch (e: unknown) {
      toast.error('PDF oluşturulamadı: ' + (e instanceof Error ? e.message : ''))
    } finally {
      setExporting(null)
    }
  }

  if (loading) {
    return (
      <div className="px-4 lg:px-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="px-4 lg:px-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Çağrılar</h1>
            <p className="text-sm text-muted-foreground">
              Tüm aramalarınız, transkriptleri ve Türkçe özetleri
            </p>
          </div>
          <Button onClick={handleSync} disabled={syncing} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Senkronize ediliyor...' : 'Aramaları Yenile'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 lg:px-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Toplam Çağrı</p>
                <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
              </div>
              <Phone className="w-8 h-8 text-muted-foreground/30" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Başarılı</p>
                <p className="text-2xl font-bold tabular-nums text-emerald-600">{stats.successful}</p>
              </div>
              <PhoneIncoming className="w-8 h-8 text-muted-foreground/30" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Toplam Süre</p>
                <p className="text-2xl font-bold tabular-nums">{Math.round(stats.totalMinutes)}<span className="text-xs font-normal ml-1">dk</span></p>
              </div>
              <Clock className="w-8 h-8 text-muted-foreground/30" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Özetlenmiş</p>
                <p className="text-2xl font-bold tabular-nums text-blue-600">{stats.withSummary}</p>
              </div>
              <FileText className="w-8 h-8 text-muted-foreground/30" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filtreler + Tablo */}
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-[250px]">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="İsim, numara veya özet ara..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tümü</SelectItem>
                    <SelectItem value="success">Tamamlanan</SelectItem>
                    <SelectItem value="failed">Başarısız</SelectItem>
                    <SelectItem value="in-progress">Devam Eden</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {selected.size > 0 ? `${selected.size} seçili` : `${filtered.length} çağrı`}
                </span>
                <Button size="sm" variant="outline" onClick={exportExcel} disabled={exporting !== null}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Excel
                </Button>
                <Button size="sm" variant="outline" onClick={exportPDF} disabled={exporting !== null}>
                  <FileText className="w-3.5 h-3.5 mr-1.5" />
                  PDF
                </Button>
                {selected.size > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setBulkAction('delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Sil
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <Phone className="w-10 h-10 mx-auto text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {search || statusFilter !== 'all' ? 'Filtrelere uygun çağrı yok' : 'Henüz çağrı yok'}
                </p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      <th className="w-10 px-3 py-2.5">
                        <Checkbox
                          checked={selected.size === filtered.length && filtered.length > 0}
                          onCheckedChange={toggleAll}
                          aria-label="Tümünü seç"
                        />
                      </th>
                      <th className="text-left px-3 py-2.5 font-medium">Müşteri</th>
                      <th className="text-left px-3 py-2.5 font-medium">Tarih</th>
                      <th className="text-left px-3 py-2.5 font-medium">Durum</th>
                      <th className="text-left px-3 py-2.5 font-medium">Süre</th>
                      <th className="text-left px-3 py-2.5 font-medium">Özet</th>
                      <th className="text-right px-3 py-2.5 font-medium">Detay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => {
                      const st = getStatusInfo(c.status, c.ended_reason)
                      return (
                        <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-3">
                            <Checkbox
                              checked={selected.has(c.id)}
                              onCheckedChange={() => toggle(c.id)}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <p className="font-medium">{c.customer_name || '—'}</p>
                            <p className="text-xs text-muted-foreground font-mono">{c.customer_number || '—'}</p>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">
                            {new Date(c.created_at).toLocaleString('tr-TR', {
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                            })}
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant="outline" className={`text-[10px] ${st.className}`}>
                              {st.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-sm tabular-nums">{formatDuration(c.duration_seconds)}</td>
                          <td className="px-3 py-3 max-w-[300px]">
                            {c.summary ? (
                              <p className="text-xs text-muted-foreground line-clamp-2" title={c.summary}>
                                {c.summary}
                              </p>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Özet bekleniyor</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Link href={`/dashboard/calls/${c.id}`}>
                              <Button size="sm" variant="ghost">
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={bulkAction === 'delete'} onOpenChange={(o) => !o && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Çağrıları sil?</AlertDialogTitle>
            <AlertDialogDescription>
              Seçili {selected.size} çağrı kalıcı olarak silinecek.
              Bu işlem geri alınamaz. Ses kayıtları ve transkriptler de silinir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={processing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? 'Siliniyor...' : 'Evet, Sil'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
