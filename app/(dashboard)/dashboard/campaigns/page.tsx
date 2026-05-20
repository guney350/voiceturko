'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus, Phone, Search, Megaphone, Users,
  Play, Pause, Trash2, Download, MoreHorizontal,
  Activity, CheckCircle2, Clock, TrendingUp, FileSpreadsheet,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Campaign {
  id: string
  name: string
  status: string
  total_contacts: number
  completed_calls: number
  successful_calls: number
  failed_calls: number
  pending_calls: number
  active_call_count: number
  max_concurrent_calls: number
  created_at: string
  started_at: string | null
  paused_at: string | null
  pause_reason: string | null
  assistant: { name: string } | null
}

type StatusFilter = 'all' | 'running' | 'paused' | 'completed' | 'draft' | 'pending'

const STATUS_BADGE: Record<string, { label: string; className: string; icon?: React.ComponentType<{ className?: string }> }> = {
  draft: { label: 'Taslak', className: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-900/30 dark:text-gray-300' },
  pending: { label: 'Hazır', className: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-900/30 dark:text-slate-300' },
  running: { label: 'Çalışıyor', className: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 animate-pulse', icon: Activity },
  paused: { label: 'Duraklatıldı', className: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200', icon: Pause },
  completed: { label: 'Tamamlandı', className: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300', icon: CheckCircle2 },
  cancelled: { label: 'İptal', className: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-300' },
}

export default function CampaignsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [bulkAction, setBulkAction] = useState<'delete' | 'pause' | null>(null)
  const [processing, setProcessing] = useState(false)

  const loadCampaigns = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('campaigns')
      .select('id, name, status, total_contacts, completed_calls, successful_calls, failed_calls, pending_calls, active_call_count, max_concurrent_calls, created_at, started_at, paused_at, pause_reason, assistant(name)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setCampaigns((data as unknown as Campaign[]) || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  // Otomatik refresh - çalışan kampanyalar için
  useEffect(() => {
    const hasRunning = campaigns.some(c => c.status === 'running')
    if (!hasRunning) return
    const t = setInterval(loadCampaigns, 5000)
    return () => clearInterval(t)
  }, [campaigns, loadCampaigns])

  // İstatistikler
  const stats = {
    total: campaigns.length,
    active: campaigns.filter(c => c.status === 'running').length,
    completed: campaigns.filter(c => c.status === 'completed').length,
    totalCalls: campaigns.reduce((s, c) => s + (c.completed_calls || 0), 0),
    successfulCalls: campaigns.reduce((s, c) => s + (c.successful_calls || 0), 0),
  }
  const successRate = stats.totalCalls > 0
    ? Math.round((stats.successfulCalls / stats.totalCalls) * 100)
    : 0

  // Filtreleme
  const filtered = campaigns.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) &&
        !c.assistant?.name?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Seçim
  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(c => c.id)))
    }
  }
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  // Aksiyonlar
  const startCampaign = async (id: string) => {
    setProcessing(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/start`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Başlatılamadı')
      toast.success('Kampanya başlatıldı')
      await loadCampaigns()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Hata oluştu')
    } finally {
      setProcessing(false)
    }
  }

  const pauseCampaign = async (id: string) => {
    setProcessing(true)
    try {
      const res = await fetch(`/api/campaigns/${id}/pause`, { method: 'POST' })
      if (!res.ok) throw new Error('Duraklatılamadı')
      toast.success('Kampanya duraklatıldı')
      await loadCampaigns()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Hata oluştu')
    } finally {
      setProcessing(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selected.size === 0) return
    setProcessing(true)
    try {
      const ids = Array.from(selected)
      await Promise.all(ids.map(id =>
        supabase.from('campaigns').delete().eq('id', id)
      ))
      toast.success(`${ids.length} kampanya silindi`)
      setSelected(new Set())
      setBulkAction(null)
      await loadCampaigns()
    } catch {
      toast.error('Silme sırasında hata oluştu')
    } finally {
      setProcessing(false)
    }
  }

  const handleBulkPause = async () => {
    if (selected.size === 0) return
    setProcessing(true)
    try {
      const ids = Array.from(selected).filter(id => {
        const c = campaigns.find(x => x.id === id)
        return c?.status === 'running'
      })
      await Promise.all(ids.map(id =>
        fetch(`/api/campaigns/${id}/pause`, { method: 'POST' })
      ))
      toast.success(`${ids.length} kampanya duraklatıldı`)
      setSelected(new Set())
      setBulkAction(null)
      await loadCampaigns()
    } catch {
      toast.error('Duraklatma sırasında hata oluştu')
    } finally {
      setProcessing(false)
    }
  }

  // Excel export
  const exportSelected = async () => {
    if (selected.size === 0) return
    const XLSX = await import('xlsx')
    const rows = campaigns
      .filter(c => selected.has(c.id))
      .map(c => ({
        'Kampanya': c.name,
        'Asistan': c.assistant?.name || '-',
        'Durum': STATUS_BADGE[c.status]?.label || c.status,
        'Toplam Kişi': c.total_contacts,
        'Tamamlanan': c.completed_calls,
        'Başarılı': c.successful_calls,
        'Başarısız': c.failed_calls,
        'Başarı %': c.completed_calls > 0 ? Math.round((c.successful_calls / c.completed_calls) * 100) : 0,
        'Oluşturulma': new Date(c.created_at).toLocaleString('tr-TR'),
      }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 30 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 20 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Kampanyalar')
    XLSX.writeFile(wb, `kampanyalar-${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success(`${selected.size} kampanya Excel'e aktarıldı`)
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
      {/* Başlık */}
      <div className="px-4 lg:px-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Kampanyalar</h1>
            <p className="text-sm text-muted-foreground">
              Arama operasyonlarınızı tek bir merkezden yönetin
            </p>
          </div>
          <Link href="/dashboard/campaigns/create">
            <Button size="lg" className="shadow-sm">
              <Plus className="mr-2 h-4 w-4" />
              Yeni Kampanya Oluştur
            </Button>
          </Link>
        </div>
      </div>

      {/* İstatistikler */}
      <div className="px-4 lg:px-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Toplam Kampanya</p>
                  <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
                </div>
                <Megaphone className="w-8 h-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Çalışan</p>
                  <p className="text-2xl font-bold tabular-nums text-blue-600">{stats.active}</p>
                </div>
                <Activity className={`w-8 h-8 ${stats.active > 0 ? 'text-blue-500 animate-pulse' : 'text-muted-foreground/30'}`} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Toplam Arama</p>
                  <p className="text-2xl font-bold tabular-nums">{stats.totalCalls.toLocaleString('tr-TR')}</p>
                </div>
                <Phone className="w-8 h-8 text-muted-foreground/30" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Başarı Oranı</p>
                  <p className="text-2xl font-bold tabular-nums text-emerald-600">{successRate}%</p>
                </div>
                <TrendingUp className="w-8 h-8 text-muted-foreground/30" />
              </div>
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
                    placeholder="Kampanya veya asistan ara..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Durumlar</SelectItem>
                    <SelectItem value="running">Çalışan</SelectItem>
                    <SelectItem value="paused">Duraklatılan</SelectItem>
                    <SelectItem value="pending">Hazır (Başlatılmamış)</SelectItem>
                    <SelectItem value="completed">Tamamlanan</SelectItem>
                    <SelectItem value="draft">Taslak</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selected.size > 0 && (
                <div className="flex items-center gap-2 bg-muted/50 border rounded-md px-3 py-2">
                  <span className="text-sm font-medium">{selected.size} seçili</span>
                  <div className="h-4 w-px bg-border" />
                  <Button size="sm" variant="ghost" onClick={exportSelected}>
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Excel
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setBulkAction('pause')}>
                    <Pause className="w-3.5 h-3.5 mr-1" />
                    Duraklat
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setBulkAction('delete')}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    Sil
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    İptal
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              campaigns.length === 0 ? (
                /* İlk kez kullanıcı için empty state */
                <div className="py-12 text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
                    <Megaphone className="w-8 h-8 text-primary" />
                  </div>
                  <div className="space-y-2 max-w-md mx-auto">
                    <h3 className="text-lg font-semibold">İlk kampanyanızı başlatın</h3>
                    <p className="text-sm text-muted-foreground">
                      Bir asistan seçin, kişi listenizi yükleyin ve dakikalar içinde otomatik aramalarınız başlasın.
                      Sistem 10 adet eşzamanlı arama hattıyla 100 kişiye aynı anda erişebilir.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Link href="/dashboard/campaigns/create">
                      <Button size="lg">
                        <Plus className="mr-2 h-4 w-4" />
                        İlk Kampanyayı Oluştur
                      </Button>
                    </Link>
                    <Link href="/dashboard/assistant/new">
                      <Button size="lg" variant="outline">
                        Önce Asistan Oluştur
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Filtrelere uyan kampanya bulunamadı
                </div>
              )
            ) : (
              <div className="border rounded-lg overflow-hidden">
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
                      <th className="text-left px-3 py-2.5 font-medium">Kampanya</th>
                      <th className="text-left px-3 py-2.5 font-medium">Durum</th>
                      <th className="text-left px-3 py-2.5 font-medium">İlerleme</th>
                      <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">Başarı</th>
                      <th className="text-right px-3 py-2.5 font-medium">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(c => {
                      const total = c.total_contacts || 0
                      const done = c.completed_calls || 0
                      const pct = total > 0 ? Math.round((done / total) * 100) : 0
                      const successPct = done > 0 ? Math.round(((c.successful_calls || 0) / done) * 100) : 0
                      const badge = STATUS_BADGE[c.status] || STATUS_BADGE.draft
                      const BadgeIcon = badge.icon
                      const canStart = ['pending', 'paused', 'draft'].includes(c.status)
                      const canPause = c.status === 'running'

                      return (
                        <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-3">
                            <Checkbox
                              checked={selected.has(c.id)}
                              onCheckedChange={() => toggle(c.id)}
                              aria-label="Kampanya seç"
                            />
                          </td>
                          <td className="px-3 py-3">
                            <Link
                              href={`/dashboard/campaigns/${c.id}`}
                              className="block group"
                            >
                              <p className="font-medium group-hover:text-primary transition-colors">{c.name}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <span>{c.assistant?.name || 'Asistan silinmiş'}</span>
                                <span>·</span>
                                <Clock className="w-3 h-3" />
                                <span>{new Date(c.created_at).toLocaleDateString('tr-TR')}</span>
                              </p>
                            </Link>
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant="outline" className={`${badge.className} text-[11px]`}>
                              {BadgeIcon && <BadgeIcon className="w-3 h-3 mr-1" />}
                              {badge.label}
                            </Badge>
                            {c.status === 'paused' && c.pause_reason && (
                              <p className="text-[10px] text-muted-foreground mt-1 truncate max-w-[140px]" title={c.pause_reason}>
                                {c.pause_reason}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3 min-w-[160px]">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="tabular-nums font-medium">{done.toLocaleString('tr-TR')} / {total.toLocaleString('tr-TR')}</span>
                              <span className="text-muted-foreground tabular-nums">{pct}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  c.status === 'running' ? 'bg-blue-500' :
                                  c.status === 'completed' ? 'bg-emerald-500' :
                                  c.status === 'paused' ? 'bg-yellow-500' : 'bg-gray-400'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {c.status === 'running' && c.active_call_count > 0 && (
                              <p className="text-[10px] text-blue-600 mt-1">
                                {c.active_call_count} aktif arama
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3 hidden lg:table-cell">
                            {done > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <div className={`w-2 h-2 rounded-full ${
                                  successPct >= 70 ? 'bg-emerald-500' :
                                  successPct >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                                }`} />
                                <span className="text-sm tabular-nums font-medium">{successPct}%</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canStart && (
                                <Button
                                  size="sm" variant="ghost"
                                  onClick={() => startCampaign(c.id)}
                                  disabled={processing}
                                  title="Başlat"
                                >
                                  <Play className="w-3.5 h-3.5 text-emerald-600" />
                                </Button>
                              )}
                              {canPause && (
                                <Button
                                  size="sm" variant="ghost"
                                  onClick={() => pauseCampaign(c.id)}
                                  disabled={processing}
                                  title="Duraklat"
                                >
                                  <Pause className="w-3.5 h-3.5 text-yellow-600" />
                                </Button>
                              )}
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => router.push(`/dashboard/campaigns/${c.id}`)}
                                title="Detay"
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </Button>
                            </div>
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

      {/* Bulk Delete Onayı */}
      <AlertDialog open={bulkAction === 'delete'} onOpenChange={(o) => !o && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kampanyaları sil?</AlertDialogTitle>
            <AlertDialogDescription>
              Seçili {selected.size} kampanya ve içindeki tüm kişi listeleri kalıcı olarak silinecek.
              Yapılan aramalar arama geçmişinizde kalır. Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>İptal</AlertDialogCancel>
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

      {/* Bulk Pause Onayı */}
      <AlertDialog open={bulkAction === 'pause'} onOpenChange={(o) => !o && setBulkAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kampanyaları duraklat?</AlertDialogTitle>
            <AlertDialogDescription>
              Seçili kampanyalardan çalışmakta olanlar duraklatılacak. Mevcut aktif aramalar tamamlanacak,
              yeni aramalar yapılmayacak. Daha sonra istediğiniz zaman tekrar başlatabilirsiniz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkPause} disabled={processing}>
              {processing ? 'Duraklatılıyor...' : 'Duraklat'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excel İpucu (boş değilse) */}
      {campaigns.length > 0 && campaigns.length < 5 && (
        <div className="px-4 lg:px-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 flex items-start gap-3">
              <FileSpreadsheet className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">İpucu: Toplu Excel Yükleme</p>
                <p className="text-xs text-muted-foreground">
                  Yeni kampanya oluştururken Excel/CSV dosyanızı sürükleyip bırakabilirsiniz. Sistem
                  sütun başlıklarınızı (İsim/Ad/Müşteri Adı, Telefon/GSM/Tel vb.) otomatik olarak tanır
                  ve kendi formatına dönüştürür. 100.000 kişiye kadar tek seferde yükleyebilirsiniz.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
