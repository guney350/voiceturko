'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  Key, Plus, Trash2, RefreshCw, Star, AlertCircle, CheckCircle2,
  XCircle, DollarSign, Upload, Download, Settings2, Search,
  TrendingUp, TrendingDown, Activity, Users, Eye, Copy, Edit3,
  Wallet, Layers, Filter, ArrowUpDown, ChevronLeft, ChevronRight,
  Pause, Zap, Clock, X, BarChart3, FileText, Archive
} from 'lucide-react'
import { toast } from 'sonner'

interface PoolKey {
  id: string
  api_key: string
  api_key_masked: string
  email: string | null
  password: string | null
  label: string | null
  notes: string | null
  status: string
  is_active: boolean
  is_assigned: boolean
  assigned_emails: string[]
  initial_balance: number
  total_spent: number
  spending_limit: number
  remaining: number
  spent_percent: number
  is_exhausted: boolean
  is_low_balance: boolean
  assigned_users: number
  total_calls_made: number
  current_active_calls: number
  max_concurrent_calls: number
  priority: number | null
  created_at: string
  last_used_at?: string
}

interface PoolStats {
  totalKeys: number
  activeKeys: number
  standbyKeys: number
  totalInitialBalance: number
  totalSpent: number
  totalRemaining: number
}

interface KeyDetail {
  account: PoolKey & { api_key: string }
  assignedUsers: Array<{ id: string; email: string }>
  recentCalls: Array<{
    id: string
    customer_name: string
    customer_number: string
    duration_seconds: number
    cost: number
    status: string
    ended_reason: string
    created_at: string
  }>
  rotations: Array<{
    id: string
    reason: string
    old_spent: number
    success: boolean
    rotated_at: string
  }>
  vapiResourceCount: number
  dailySpend: Record<string, number>
}

type StatusFilter = 'all' | 'active' | 'assigned' | 'standby' | 'exhausted' | 'low'
type SortField = 'created' | 'spent' | 'remaining' | 'usage' | 'email'

const PAGE_SIZE_OPTIONS = [10, 50, 100, 1000, 2000, 5000, 10000] as const
const DEFAULT_PAGE_SIZE = 50
const AUTO_REFRESH_INTERVALS = { off: 0, '10s': 10000, '30s': 30000, '1m': 60000 } as const

export default function AdminPoolPage() {
  const [stats, setStats] = useState<PoolStats | null>(null)
  const [keys, setKeys] = useState<PoolKey[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showLimitModal, setShowLimitModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [spendingLimit, setSpendingLimit] = useState('9.50')
  const [submitting, setSubmitting] = useState(false)
  const [addForm, setAddForm] = useState({ email: '', password: '', apiKey: '' })
  const [importText, setImportText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Yeni state'ler
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortField, setSortField] = useState<SortField>('spent')
  const [sortDesc, setSortDesc] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [autoRefresh, setAutoRefresh] = useState<keyof typeof AUTO_REFRESH_INTERVALS>('off')
  const [selectedKey, setSelectedKey] = useState<PoolKey | null>(null)
  const [keyDetail, setKeyDetail] = useState<KeyDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [editingKey, setEditingKey] = useState<PoolKey | null>(null)
  const [editForm, setEditForm] = useState({ label: '', notes: '', priority: '100', maxConcurrentCalls: '10' })
  const [dragActive, setDragActive] = useState(false)
  const [showPasswordReveal, setShowPasswordReveal] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)

  const fetchPool = useCallback(async (silent: boolean = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch('/api/admin/pool')
      const data = await res.json()
      if (data.success) {
        setStats(data.stats)
        setKeys(data.keys)
        setLastSyncTime(new Date())
      }
    } catch (err) {
      console.error('Pool fetch error:', err)
      if (!silent) toast.error('Veriler yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPool() }, [fetchPool])

  // Auto-refresh
  useEffect(() => {
    const interval = AUTO_REFRESH_INTERVALS[autoRefresh]
    if (interval > 0) {
      const id = setInterval(() => fetchPool(true), interval)
      return () => clearInterval(id)
    }
  }, [autoRefresh, fetchPool])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        fetchPool()
      }
      if (e.key === '/' && !e.ctrlKey) {
        e.preventDefault()
        document.getElementById('pool-search')?.focus()
      }
      if (e.key === 'Escape') {
        setSelectedKey(null)
        setEditingKey(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fetchPool])

  // Filtrelenmiş ve sıralanmış key'ler
  const filteredKeys = useMemo(() => {
    let filtered = [...keys]

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(k =>
        (k.email && k.email.toLowerCase().includes(q)) ||
        (k.label && k.label.toLowerCase().includes(q)) ||
        k.api_key.toLowerCase().includes(q) ||
        k.assigned_emails.some(e => e.toLowerCase().includes(q))
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(k => {
        if (statusFilter === 'assigned') return k.is_assigned
        if (statusFilter === 'standby') return k.is_active && !k.is_assigned && !k.is_exhausted
        if (statusFilter === 'exhausted') return k.is_exhausted
        if (statusFilter === 'low') return k.is_low_balance && !k.is_exhausted
        if (statusFilter === 'active') return k.is_active
        return true
      })
    }

    // Sort
    filtered.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'created':
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          break
        case 'spent':
          cmp = a.total_spent - b.total_spent
          break
        case 'remaining':
          cmp = a.remaining - b.remaining
          break
        case 'usage':
          cmp = a.spent_percent - b.spent_percent
          break
        case 'email':
          cmp = (a.email || '').localeCompare(b.email || '')
          break
      }
      return sortDesc ? -cmp : cmp
    })

    return filtered
  }, [keys, searchQuery, statusFilter, sortField, sortDesc])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredKeys.length / pageSize))
  const paginatedKeys = useMemo(() => {
    const start = page * pageSize
    return filteredKeys.slice(start, start + pageSize)
  }, [filteredKeys, page, pageSize])

  // Reset page when filter or page size changes
  useEffect(() => setPage(0), [searchQuery, statusFilter, sortField, sortDesc, pageSize])

  // Smart stats
  const enhancedStats = useMemo(() => {
    if (!stats || !keys.length) return null
    const exhaustedCount = keys.filter(k => k.is_exhausted).length
    const lowBalanceCount = keys.filter(k => k.is_low_balance && !k.is_exhausted).length
    const assignedCount = keys.filter(k => k.is_assigned).length
    const totalActiveCalls = keys.reduce((s, k) => s + (k.current_active_calls || 0), 0)
    const totalCapacity = keys.filter(k => k.is_active).reduce((s, k) => s + (k.max_concurrent_calls || 10), 0)
    const healthScore = stats.totalKeys > 0
      ? Math.round(((stats.totalKeys - exhaustedCount) / stats.totalKeys) * 100)
      : 100
    return {
      ...stats,
      exhaustedCount,
      lowBalanceCount,
      assignedCount,
      totalActiveCalls,
      totalCapacity,
      healthScore,
      uniqueUsers: new Set(keys.flatMap(k => k.assigned_emails)).size,
    }
  }, [stats, keys])

  // ============== HANDLERS ==============

  const handleAddAccount = async () => {
    if (!addForm.apiKey) { toast.error('API key zorunlu'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: addForm.apiKey, email: addForm.email, password: addForm.password }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('Hesap havuza eklendi')
        setShowAddModal(false)
        setAddForm({ email: '', password: '', apiKey: '' })
        fetchPool()
      } else {
        toast.error(data.error || 'Eklenemedi')
      }
    } catch { toast.error('Hata oluştu') }
    finally { setSubmitting(false) }
  }

  const handleImport = async () => {
    const lines = importText.split('\n').map(l => l.trim()).filter(Boolean)
    const accounts: Array<{ email: string; password: string; apiKey: string }> = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.includes(':') && line.includes('@') && i + 1 < lines.length) {
        const [email, password] = line.split(':', 2)
        const apiKey = lines[i + 1]
        if (apiKey && apiKey.length > 20 && !apiKey.includes('@')) {
          accounts.push({ email: email.trim(), password: password.trim(), apiKey: apiKey.trim() })
          i++
          continue
        }
      }
      if (line.length > 20 && !line.includes('@')) {
        accounts.push({ email: '', password: '', apiKey: line })
      }
    }

    if (accounts.length === 0) { toast.error('Geçerli hesap bulunamadı'); return }

    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', accounts }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${data.imported} hesap eklendi${data.skipped > 0 ? `, ${data.skipped} atlandı` : ''}`)
        setShowImportModal(false)
        setImportText('')
        fetchPool()
      }
    } catch { toast.error('İçe aktarma hatası') }
    finally { setSubmitting(false) }
  }

  const handleFileUpload = (files: FileList | null) => {
    if (!files) return
    let allText = ''
    let loaded = 0
    for (let i = 0; i < files.length; i++) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        allText += (ev.target?.result as string) + '\n'
        loaded++
        if (loaded === files.length) {
          setImportText(prev => prev ? prev + '\n' + allText : allText)
        }
      }
      reader.readAsText(files[i])
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files)
    }
  }

  const handleExport = async (selectedOnly: boolean = false) => {
    try {
      const res = await fetch('/api/admin/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'export' }),
      })
      const data = await res.json()
      if (data.success) {
        let content = data.content
        if (selectedOnly && selectedIds.size > 0) {
          // Filter export by selected
          const selectedKeys = keys.filter(k => selectedIds.has(k.id))
          content = selectedKeys.map(k => {
            const emailLine = k.email && k.password ? `${k.email}:${k.password}` : (k.email || '')
            return emailLine ? `${emailLine}\n${k.api_key}` : k.api_key
          }).join('\n')
        }
        const blob = new Blob([content], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `vapi_pool_${new Date().toISOString().slice(0, 10)}.txt`
        a.click()
        URL.revokeObjectURL(url)
        toast.success(`${selectedOnly ? selectedIds.size : 'Tüm'} hesap dışa aktarıldı`)
      }
    } catch { toast.error('Dışa aktarma hatası') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu hesabı havuzdan kalıcı olarak silmek istiyor musunuz?')) return
    try {
      await fetch(`/api/admin/pool?id=${id}`, { method: 'DELETE' })
      fetchPool()
      toast.success('Hesap silindi')
    } catch { toast.error('Silinemedi') }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`${selectedIds.size} hesabı kalıcı olarak silmek istiyor musunuz?`)) return
    try {
      const res = await fetch('/api/admin/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_delete', ids: [...selectedIds] }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${data.deleted} hesap silindi`)
        setSelectedIds(new Set())
        fetchPool()
      }
    } catch { toast.error('Toplu silme hatası') }
  }

  const handleSyncSpending = async (accountId?: string) => {
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_spending', accountId }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(accountId ? `Güncellendi: $${data.totalSpent?.toFixed(2) || '0'}` : `${data.synced} hesap senkronize edildi`)
        fetchPool()
      }
    } catch { toast.error('Senkronizasyon hatası') }
    finally { setSyncing(false) }
  }

  const handleBulkSync = async () => {
    if (selectedIds.size === 0) return
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_sync', ids: [...selectedIds] }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${data.synced} hesap senkronize edildi`)
        fetchPool()
      }
    } catch { toast.error('Toplu sync hatası') }
    finally { setSyncing(false) }
  }

  const handleUpdateSpendingLimit = async () => {
    const limit = parseFloat(spendingLimit)
    if (!limit || limit <= 0) { toast.error('Geçersiz limit'); return }
    try {
      await fetch('/api/admin/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_spending_limit', spendingLimit: limit }),
      })
      toast.success(`Harcama limiti güncellendi: $${limit.toFixed(2)}`)
      setShowLimitModal(false)
      fetchPool()
    } catch { toast.error('Limit güncellenemedi') }
  }

  const handleSelectKey = async (key: PoolKey) => {
    setSelectedKey(key)
    setLoadingDetail(true)
    setKeyDetail(null)
    try {
      const res = await fetch('/api/admin/pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'key_detail', id: key.id }),
      })
      const data = await res.json()
      if (data.success) setKeyDetail(data)
    } catch { toast.error('Detay yüklenemedi') }
    finally { setLoadingDetail(false) }
  }

  const handleEditKey = (key: PoolKey) => {
    setEditingKey(key)
    setEditForm({
      label: key.label || '',
      notes: key.notes || '',
      priority: String(key.priority || 100),
      maxConcurrentCalls: String(key.max_concurrent_calls || 10),
    })
  }

  const handleSaveEdit = async () => {
    if (!editingKey) return
    try {
      const res = await fetch('/api/admin/pool', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingKey.id,
          label: editForm.label || null,
          notes: editForm.notes || null,
          priority: parseInt(editForm.priority) || 100,
          maxConcurrentCalls: parseInt(editForm.maxConcurrentCalls) || 10,
        }),
      })
      if (res.ok) {
        toast.success('Hesap güncellendi')
        setEditingKey(null)
        fetchPool()
      } else {
        toast.error('Güncellenemedi')
      }
    } catch { toast.error('Hata oluştu') }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} kopyalandı`)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedKeys.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginatedKeys.map(k => k.id)))
    }
  }

  // ============== RENDER ==============

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 mx-auto animate-spin text-primary mb-2" />
          <p className="text-sm text-muted-foreground">Havuz yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* ============== HEADER ============== */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Key className="w-6 h-6 text-primary" />
            </div>
          <div>
              <h1 className="text-2xl font-bold tracking-tight">API Havuzu</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Activity className="w-3 h-3" />
                {lastSyncTime ? `Son güncelleme: ${lastSyncTime.toLocaleTimeString('tr-TR')}` : 'Yeni veri bekleniyor'}
                {enhancedStats && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    enhancedStats.healthScore > 80 ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' :
                    enhancedStats.healthScore > 50 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300' :
                    'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                  }`}>
                    Sistem Sağlığı: %{enhancedStats.healthScore}
                  </span>
                )}
              </p>
          </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Switch
                checked={autoRefresh !== 'off'}
                onCheckedChange={c => setAutoRefresh(c ? '10s' : 'off')}
              />
              <span>Otomatik</span>
              {autoRefresh !== 'off' && (
                <Select value={autoRefresh} onValueChange={v => setAutoRefresh(v as keyof typeof AUTO_REFRESH_INTERVALS)}>
                  <SelectTrigger className="h-7 w-20"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10s">10sn</SelectItem>
                    <SelectItem value="30s">30sn</SelectItem>
                    <SelectItem value="1m">1dk</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => fetchPool()} title="Yenile (Ctrl+R)">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport(false)}>
              <Download className="w-4 h-4 mr-2" />Dışa Aktar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
              <Upload className="w-4 h-4 mr-2" />İçe Aktar
            </Button>
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-2" />Hesap Ekle
            </Button>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-6 space-y-4">
        {/* ============== STATS DASHBOARD ============== */}
        {enhancedStats && (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {/* Total Balance */}
            <Card className="border-primary/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Kalan Bakiye</p>
                  <Wallet className="w-3.5 h-3.5 text-primary" />
                  </div>
                <p className="text-2xl font-bold text-primary">${enhancedStats.totalRemaining.toFixed(0)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">${enhancedStats.totalSpent.toFixed(2)} harcandı</p>
              </CardContent>
            </Card>

            {/* Total Keys */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Toplam Hat</p>
                  <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                <p className="text-2xl font-bold">{enhancedStats.totalKeys}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{enhancedStats.totalCapacity} eşzamanlı kapasite</p>
              </CardContent>
            </Card>

            {/* Assigned */}
            <Card className="border-blue-500/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Atanmış</p>
                  <Users className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <p className="text-2xl font-bold text-blue-500">{enhancedStats.assignedCount}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{enhancedStats.uniqueUsers} kullanıcıya</p>
              </CardContent>
            </Card>

            {/* Standby */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Boş Hat</p>
                  <Pause className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold">{enhancedStats.standbyKeys}</p>
                <p className="text-[10px] text-muted-foreground mt-1">Yeni user için</p>
              </CardContent>
            </Card>

            {/* Active Calls */}
            <Card className="border-green-500/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Aktif Çağrı</p>
                  <Zap className="w-3.5 h-3.5 text-green-500" />
                </div>
                <p className="text-2xl font-bold text-green-500">{enhancedStats.totalActiveCalls}</p>
                <p className="text-[10px] text-muted-foreground mt-1">/ {enhancedStats.totalCapacity} kapasite</p>
              </CardContent>
            </Card>

            {/* Alerts */}
            <Card className={enhancedStats.exhaustedCount > 0 ? 'border-red-500/30' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground font-medium">Uyarılar</p>
                  <AlertCircle className={`w-3.5 h-3.5 ${enhancedStats.exhaustedCount + enhancedStats.lowBalanceCount > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-red-500">Tükenmiş</span>
                    <span className="font-bold">{enhancedStats.exhaustedCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-yellow-500">Düşük</span>
                    <span className="font-bold">{enhancedStats.lowBalanceCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ============== FILTERS BAR ============== */}
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="pool-search"
                  placeholder="Email, label, API key, atanan kullanıcı... (basın / )"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="w-3.5 h-3.5 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü ({keys.length})</SelectItem>
                  <SelectItem value="assigned">Atanmış ({keys.filter(k => k.is_assigned).length})</SelectItem>
                  <SelectItem value="standby">Boş ({keys.filter(k => k.is_active && !k.is_assigned && !k.is_exhausted).length})</SelectItem>
                  <SelectItem value="low">Düşük ({keys.filter(k => k.is_low_balance && !k.is_exhausted).length})</SelectItem>
                  <SelectItem value="exhausted">Tükenmiş ({keys.filter(k => k.is_exhausted).length})</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortField} onValueChange={v => setSortField(v as SortField)}>
                <SelectTrigger className="w-[140px]">
                  <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="spent">Harcama</SelectItem>
                  <SelectItem value="remaining">Kalan</SelectItem>
                  <SelectItem value="usage">Kullanım %</SelectItem>
                  <SelectItem value="created">Tarih</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="ghost" size="icon" onClick={() => setSortDesc(!sortDesc)} title={sortDesc ? 'Azalan' : 'Artan'}>
                {sortDesc ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              </Button>

              <div className="text-xs text-muted-foreground flex-shrink-0 ml-auto">
                {filteredKeys.length} / {keys.length} hesap
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ============== SELECTED ACTIONS ============== */}
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/5 border border-primary/30 rounded-lg p-3">
            <span className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              {selectedIds.size} hesap seçildi
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>İptal</Button>
              <Button variant="outline" size="sm" onClick={() => handleExport(true)}>
                <Download className="w-3.5 h-3.5 mr-1" />Dışa Aktar
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkSync} disabled={syncing}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`} />Sync
              </Button>
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="w-3.5 h-3.5 mr-1" />Sil
            </Button>
            </div>
          </div>
        )}

        {/* ============== KEY TABLE ============== */}
        <Card>
          <CardContent className="p-0">
            {paginatedKeys.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-muted-foreground">
                <Key className="w-12 h-12 mb-3 opacity-20" />
                <p className="font-medium mb-1">{searchQuery || statusFilter !== 'all' ? 'Filtreye uygun hesap yok' : 'Havuzda henüz hesap yok'}</p>
                <p className="text-xs">{searchQuery || statusFilter !== 'all' ? 'Filtreleri temizle veya farklı arama yap' : 'Sağ üstten "Hesap Ekle" ile başla'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/30">
                    <tr className="border-b">
                      <th className="py-2 px-3 w-8">
                        <Checkbox
                          checked={selectedIds.size === paginatedKeys.length && paginatedKeys.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="py-2 px-2 text-xs font-medium text-muted-foreground text-left">Durum</th>
                      <th className="py-2 px-2 text-xs font-medium text-muted-foreground text-left">Hesap</th>
                      <th className="py-2 px-2 text-xs font-medium text-muted-foreground text-left">Etiket</th>
                      <th className="py-2 px-2 text-xs font-medium text-muted-foreground text-right">Bakiye</th>
                      <th className="py-2 px-2 text-xs font-medium text-muted-foreground">Kullanım</th>
                      <th className="py-2 px-2 text-xs font-medium text-muted-foreground text-center">Aktif</th>
                      <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedKeys.map(key => (
                      <tr
                        key={key.id}
                        className={`border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer ${
                          selectedIds.has(key.id) ? 'bg-primary/5' :
                          key.is_exhausted ? 'bg-red-500/5' :
                          key.is_low_balance ? 'bg-yellow-500/5' :
                          key.is_assigned ? '' : ''
                        }`}
                        onClick={() => handleSelectKey(key)}
                      >
                        <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.has(key.id)} onCheckedChange={() => toggleSelect(key.id)} />
                        </td>

                        <td className="py-2 px-2">
                          {key.is_exhausted ? (
                            <Badge variant="destructive" className="text-[10px] gap-1">
                              <XCircle className="w-2.5 h-2.5" />Tükendi
                            </Badge>
                          ) : key.is_assigned ? (
                            <Badge className="bg-blue-500 hover:bg-blue-600 text-[10px] gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />Atanmış
                            </Badge>
                          ) : key.is_low_balance ? (
                            <Badge className="bg-yellow-500 hover:bg-yellow-600 text-[10px] gap-1">
                              <AlertCircle className="w-2.5 h-2.5" />Düşük
                            </Badge>
                          ) : key.is_active ? (
                            <Badge variant="outline" className="text-[10px] border-green-500 text-green-700 dark:text-green-400 gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />Hazır
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Pasif</Badge>
                          )}
                        </td>

                        <td className="py-2 px-2">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium truncate max-w-[200px]">
                              {key.email || key.api_key_masked}
                            </span>
                            {key.assigned_emails.length > 0 && (
                              <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                → {key.assigned_emails.join(', ')}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2 px-2">
                          {key.label ? (
                            <Badge variant="outline" className="text-[10px]">{key.label}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>

                        <td className="py-2 px-2 text-right">
                          <div className="flex flex-col items-end">
                            <span className={`font-mono text-sm font-bold ${
                              key.remaining < 1 ? 'text-red-500' :
                              key.remaining < 2 ? 'text-yellow-500' :
                              'text-green-600 dark:text-green-400'
                            }`}>
                            ${key.remaining.toFixed(2)}
                          </span>
                            <span className="text-[10px] text-muted-foreground">
                              ${key.total_spent.toFixed(2)} / ${key.initial_balance.toFixed(0)}
                            </span>
                          </div>
                        </td>

                        <td className="py-2 px-2">
                          <div className="w-20 mx-auto">
                            <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                              <span>{key.spent_percent.toFixed(0)}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  key.spent_percent >= 95 ? 'bg-red-500' :
                                  key.spent_percent >= 80 ? 'bg-yellow-500' :
                                  'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(100, key.spent_percent)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-2 px-2 text-center">
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {key.current_active_calls}/{key.max_concurrent_calls}
                          </Badge>
                        </td>

                        <td className="py-2 px-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleSelectKey(key)}
                              title="Detay"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleEditKey(key)}
                              title="Düzenle"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleSyncSpending(key.id)}
                              disabled={syncing}
                              title="Sync"
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => handleDelete(key.id)}
                              title="Sil"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============== PAGINATION ============== */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Sayfa {page + 1} / {totalPages} • Gösterilen: {paginatedKeys.length} / {filteredKeys.length}
            </p>
            {/* Sayfa boyutu seçici */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Sayfada:</span>
              <Select value={String(pageSize)} onValueChange={v => setPageSize(parseInt(v, 10))}>
                <SelectTrigger className="h-7 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map(opt => (
                    <SelectItem key={opt} value={String(opt)} className="text-xs">
                      {opt.toLocaleString('tr-TR')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(0)} disabled={page === 0}>
                «
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>
                »
              </Button>
            </div>
          )}
        </div>

        {/* Keyboard Shortcuts Hint */}
        <p className="text-[10px] text-muted-foreground text-center">
          Kısayollar: <kbd className="px-1 rounded bg-muted">/</kbd> arama •{' '}
          <kbd className="px-1 rounded bg-muted">Ctrl+R</kbd> yenile •{' '}
          <kbd className="px-1 rounded bg-muted">Esc</kbd> kapat
        </p>
      </div>

      {/* ============== DETAIL DRAWER ============== */}
      <Sheet open={!!selectedKey} onOpenChange={(open) => !open && setSelectedKey(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              {selectedKey?.email || selectedKey?.api_key_masked}
            </SheetTitle>
            <SheetDescription>
              {selectedKey?.id.substring(0, 8)}... • Eklenme: {selectedKey && new Date(selectedKey.created_at).toLocaleDateString('tr-TR')}
            </SheetDescription>
          </SheetHeader>

          {loadingDetail ? (
            <div className="py-12 text-center">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin text-muted-foreground" />
            </div>
          ) : keyDetail && selectedKey ? (
            <Tabs defaultValue="overview" className="mt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Genel</TabsTrigger>
                <TabsTrigger value="calls">Aramalar ({keyDetail.recentCalls.length})</TabsTrigger>
                <TabsTrigger value="users">Kullanıcılar ({keyDetail.assignedUsers.length})</TabsTrigger>
                <TabsTrigger value="history">Geçmiş</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                {/* Credentials */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Kimlik Bilgileri</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Email</p>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-muted px-2 py-1 rounded flex-1">{selectedKey.email || '—'}</code>
                        {selectedKey.email && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(selectedKey.email!, 'Email')}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Şifre</p>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-muted px-2 py-1 rounded flex-1">
                          {showPasswordReveal ? (selectedKey.password || '—') : '••••••••'}
                        </code>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPasswordReveal(!showPasswordReveal)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                        {selectedKey.password && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(selectedKey.password!, 'Şifre')}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">API Key</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded flex-1 font-mono">
                          {revealedKey === selectedKey.id ? keyDetail.account.api_key : selectedKey.api_key_masked}
                        </code>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRevealedKey(revealedKey === selectedKey.id ? null : selectedKey.id)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyToClipboard(keyDetail.account.api_key, 'API Key')}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="p-3 text-center">
                      <DollarSign className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                      <p className="text-xl font-bold">${selectedKey.remaining.toFixed(2)}</p>
                      <p className="text-[10px] text-muted-foreground">Kalan</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <Activity className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                      <p className="text-xl font-bold">{selectedKey.total_calls_made}</p>
                      <p className="text-[10px] text-muted-foreground">Toplam Çağrı</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3 text-center">
                      <FileText className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                      <p className="text-xl font-bold">{keyDetail.vapiResourceCount}</p>
                      <p className="text-[10px] text-muted-foreground">VAPI Kaynak</p>
                    </CardContent>
                  </Card>
                </div>

                {/* 7 günlük harcama */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />Son 7 Gün Harcama
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-end gap-1 h-20">
                      {Object.entries(keyDetail.dailySpend).map(([date, amount]) => {
                        const max = Math.max(...Object.values(keyDetail.dailySpend), 0.01)
                        const height = (amount / max) * 100
                        return (
                          <div key={date} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full bg-muted rounded-t" style={{ height: `${Math.max(height, 2)}%` }}>
                              <div className={`w-full h-full rounded-t ${amount > 0 ? 'bg-primary' : 'bg-muted'}`} />
                            </div>
                            <span className="text-[8px] text-muted-foreground">{date.slice(5)}</span>
                            <span className="text-[10px] font-mono">${amount.toFixed(2)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Notlar */}
                {selectedKey.notes && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Notlar</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedKey.notes}</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="calls" className="space-y-2 mt-4">
                {keyDetail.recentCalls.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Henüz arama yok</p>
                ) : (
                  keyDetail.recentCalls.map(call => (
                    <div key={call.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{call.customer_name || 'Bilinmiyor'}</p>
                        <p className="text-xs text-muted-foreground">
                          {call.customer_number} • {new Date(call.created_at).toLocaleString('tr-TR')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono">
                          {Math.floor(call.duration_seconds / 60)}:{String(call.duration_seconds % 60).padStart(2, '0')}
                        </p>
                        <p className="text-xs text-muted-foreground">${call.cost?.toFixed(3) || '0.000'}</p>
                      </div>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="users" className="space-y-2 mt-4">
                {keyDetail.assignedUsers.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Bu hat henüz kimseye atanmamış</p>
                ) : (
                  keyDetail.assignedUsers.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm">{u.email}</span>
                      </div>
                      <code className="text-xs text-muted-foreground">{u.id.substring(0, 8)}</code>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="history" className="space-y-2 mt-4">
                {keyDetail.rotations.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">Henüz rotation yapılmamış</p>
                ) : (
                  keyDetail.rotations.map(r => (
                    <div key={r.id} className="p-3 rounded-lg border">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant={r.success ? 'default' : 'destructive'} className="text-[10px]">
                          {r.success ? 'Başarılı' : 'Başarısız'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{new Date(r.rotated_at).toLocaleString('tr-TR')}</span>
                      </div>
                      <p className="text-sm">{r.reason}</p>
                      <p className="text-xs text-muted-foreground mt-1">Eski harcama: ${r.old_spent?.toFixed(2) || '0.00'}</p>
                    </div>
                  ))
                )}
              </TabsContent>
            </Tabs>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* ============== ADD MODAL ============== */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yeni Hesap Ekle</DialogTitle>
            <DialogDescription>VAPI hesap bilgilerini girin</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>E-posta</Label>
              <Input type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} placeholder="email@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Şifre</Label>
              <Input value={addForm.password} onChange={e => setAddForm({ ...addForm, password: e.target.value })} placeholder="VAPI hesap şifresi" />
            </div>
            <div className="space-y-2">
              <Label>API Anahtarı *</Label>
              <Input value={addForm.apiKey} onChange={e => setAddForm({ ...addForm, apiKey: e.target.value })} placeholder="478d61ff-1f9c-435a-..." className="font-mono text-sm" required />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>İptal</Button>
            <Button onClick={handleAddAccount} disabled={submitting}>{submitting ? 'Ekleniyor...' : 'Havuza Ekle'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== IMPORT MODAL (drag-drop) ============== */}
      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Toplu İçe Aktar</DialogTitle>
            <DialogDescription>Birden fazla VAPI hesabını dosyadan veya yapıştırarak ekleyin</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
              <p className="font-medium">Format:</p>
              <code className="text-green-600 block">email@ornek.com:sifre123</code>
              <code className="text-green-600 block">478d61ff-1f9c-435a-9920-...</code>
              <p className="text-muted-foreground mt-1">Her hesap için: 1. satır email:şifre, 2. satır API key</p>
            </div>

            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
                dragActive ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm font-medium">{dragActive ? 'Bırakın' : 'Dosyaları buraya sürükleyin'}</p>
              <p className="text-xs text-muted-foreground mt-1">veya tıklayıp seçin (.txt dosyaları)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt"
                multiple
                onChange={e => handleFileUpload(e.target.files)}
                className="hidden"
              />
            </div>

            <div>
              <Label className="text-xs">Veya doğrudan yapıştırın:</Label>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
                placeholder="Hesapları buraya yapıştırın..."
                className="w-full min-h-[200px] mt-1 resize-y font-mono text-xs rounded-md border border-input bg-background px-3 py-2"
              />
              {importText && (
                <p className="text-xs text-muted-foreground mt-1">
                  {importText.split('\n').filter(l => l.trim()).length} satır
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportModal(false); setImportText('') }}>İptal</Button>
            <Button onClick={handleImport} disabled={submitting || !importText.trim()}>
              {submitting ? 'İşleniyor...' : 'İçe Aktar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== EDIT MODAL ============== */}
      <Dialog open={!!editingKey} onOpenChange={(o) => !o && setEditingKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hesabı Düzenle</DialogTitle>
            <DialogDescription>{editingKey?.email || editingKey?.api_key_masked}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Etiket</Label>
              <Input value={editForm.label} onChange={e => setEditForm({ ...editForm, label: e.target.value })} placeholder="Örn: Müşteri A" />
            </div>
            <div className="space-y-2">
              <Label>Notlar</Label>
              <textarea
                value={editForm.notes}
                onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Bu hesap hakkında notlar..."
                className="w-full min-h-[80px] resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Öncelik</Label>
                <Input type="number" value={editForm.priority} onChange={e => setEditForm({ ...editForm, priority: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Max Eşzamanlı</Label>
                <Input type="number" value={editForm.maxConcurrentCalls} onChange={e => setEditForm({ ...editForm, maxConcurrentCalls: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingKey(null)}>İptal</Button>
            <Button onClick={handleSaveEdit}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== LIMIT MODAL ============== */}
      <Dialog open={showLimitModal} onOpenChange={setShowLimitModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Harcama Limiti</DialogTitle>
            <DialogDescription>Bu limit aşılınca hesap otomatik değiştirilir</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-muted-foreground" />
            <Input type="number" step="0.01" value={spendingLimit} onChange={e => setSpendingLimit(e.target.value)} className="text-xl font-bold" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLimitModal(false)}>İptal</Button>
            <Button onClick={handleUpdateSpendingLimit}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
