'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoHint } from '@/components/ui/info-hint'
import {
  ArrowLeft, Upload, Download, CheckCircle2, Plus, Trash2,
  FileSpreadsheet, UserPlus, Sparkles, Rocket, Info, Bot,
  Phone as PhoneIcon, Wand2, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import {
  BUILTIN_RUNTIME_VARIABLES,
  extractRuntimeValues,
  type RuntimeVariable,
  type AssistantTemplate,
} from '@/lib/assistant-templates'

interface ContactEntry {
  name: string
  phone_number: string
  customer_data: Record<string, string>
}

interface AssistantRow {
  id: string
  name: string
  runtime_variables?: RuntimeVariable[]
  template_slug?: string
}

interface SipRow {
  id: string
  name: string
  phone_number: string | null
}

export default function CreateCampaignPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [loadingAssistants, setLoadingAssistants] = useState(true)
  const [assistants, setAssistants] = useState<AssistantRow[]>([])
  const [sips, setSips] = useState<SipRow[]>([])

  const [formData, setFormData] = useState({
    name: '',
    assistant_id: '',
    sip_id: '',
    concurrent_calls: 10,
  })

  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [contacts, setContacts] = useState<ContactEntry[]>([])
  const [activeTab, setActiveTab] = useState<'excel' | 'manual'>('excel')

  // Manuel ekleme form state
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualExtras, setManualExtras] = useState<Record<string, string>>({})

  // Drag-drop state
  const [isDragging, setIsDragging] = useState(false)

  // Asistan + SIP yükle (migration 008 yoksa fallback ile)
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoadingAssistants(false); return }

        // Asistanları al (yeni kolonlarla, fallback'li)
        let aRes = await supabase
          .from('assistant')
          .select('id, name, runtime_variables, template_slug')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (aRes.error) {
          console.warn('[campaigns/create] runtime_variables yok, fallback:', aRes.error.message)
          const fb = await supabase
            .from('assistant')
            .select('id, name')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
          aRes = { ...fb, count: null, status: 200 as const, statusText: 'OK' } as any
        }
        setAssistants((aRes.data as AssistantRow[]) || [])

        // SIP'leri al
        const sRes = await supabase
          .from('sips')
          .select('id, name, phone_number')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
        setSips((sRes.data as SipRow[]) || [])

        // Tek SIP varsa otomatik seç
        if ((sRes.data || []).length === 1) {
          setFormData(prev => ({ ...prev, sip_id: (sRes.data as SipRow[])[0].id }))
        }
      } catch (e) {
        console.error('[campaigns/create] load error:', e)
      } finally {
        setLoadingAssistants(false)
      }
    })()
  }, [supabase])

  // Seçili asistanın manifest'i
  const selectedAssistant = assistants.find(a => a.id === formData.assistant_id)
  const assistantManifest: RuntimeVariable[] = Array.isArray(selectedAssistant?.runtime_variables)
    ? selectedAssistant!.runtime_variables!
    : []

  const effectiveVariables: RuntimeVariable[] = (() => {
    const seen = new Set<string>()
    const list: RuntimeVariable[] = []
    for (const v of assistantManifest) {
      if (!seen.has(v.key)) { list.push(v); seen.add(v.key) }
    }
    for (const v of BUILTIN_RUNTIME_VARIABLES) {
      if (!seen.has(v.key)) { list.push(v); seen.add(v.key) }
    }
    return list
  })()
  const extraVariables = effectiveVariables.filter(
    v => v.key !== 'customerName' && v.key !== 'customerPhone'
  )

  // Excel parse
  const handleFile = useCallback(async (file: File) => {
    const validExt = ['.xlsx', '.xls', '.csv']
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!validExt.includes(ext)) {
      toast.error('Sadece Excel (.xlsx, .xls) veya CSV dosyaları desteklenir')
      return
    }
    setUploadedFile(file)

    try {
      const buf = await file.arrayBuffer()
      const isCsv = ext === '.csv'

      // ============================================================
      // AKILLI ENCODING DETECTION (CSV icin)
      // Coklu encoding dener, Turkce karakter zenginligine gore puanlar.
      // ============================================================
      const scoreText = (text: string): number => {
        if (!text) return -1000
        // Turkce karakterler (dogru): yuksek skor
        const goodTr = (text.match(/[çÇğĞıİöÖşŞüÜ]/g) || []).length
        // Mojibake patterns: dusuk skor
        const mojibakeStrict = (text.match(/Ã[\u0080-\u00FF]/g) || []).length
        const mojibakeLoose = (text.match(/[ÃÄÅÂ][a-zA-Z\u0080-\u00FF]/g) || []).length
        // Replacement / non-printable
        const bad = (text.match(/[\uFFFD\u0000-\u0008\u000B-\u001F]/g) || []).length
        return goodTr * 10 - mojibakeStrict * 8 - mojibakeLoose * 3 - bad * 20
      }

      let bestText: string | null = null
      let bestScore = -Infinity
      let bestEncoding = 'native'

      if (isCsv) {
        // 5 encoding dene
        const tryEncodings = ['utf-8', 'windows-1254', 'iso-8859-9', 'windows-1252', 'iso-8859-1']
        for (const enc of tryEncodings) {
          try {
            const text = new TextDecoder(enc, { fatal: false }).decode(buf)
            const score = scoreText(text)
            console.log(`[Excel] Encoding ${enc}: score=${score}, sample="${text.substring(0, 100)}"`)
            if (score > bestScore) {
              bestScore = score
              bestText = text
              bestEncoding = enc
            }
          } catch (e) {
            console.warn(`[Excel] ${enc} decode hatasi:`, e)
          }
        }

        if (bestEncoding !== 'utf-8' && bestText) {
          toast.info(`Türkçe karakter düzeltmesi uygulandı (${bestEncoding} encoding tespit edildi)`, { duration: 3000 })
        }
      }

      let wb: XLSX.WorkBook
      if (isCsv && bestText) {
        wb = XLSX.read(bestText, { type: 'string', cellDates: true, raw: true })
      } else {
        wb = XLSX.read(buf, { type: 'array', cellDates: true })
      }
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })

      if (rows.length === 0) {
        toast.error('Dosyada veri bulunamadı')
        return
      }

      const pseudoTpl = {
        template: { runtimeVariables: assistantManifest },
      } as unknown as AssistantTemplate

      // Tek tek string'leri mojibake icin tara - varsa duzelt
      // Coklu strateji: 1) Latin1->UTF8 reinterpret 2) Bilinen mojibake replacement map
      const MOJIBAKE_MAP: Array<[RegExp, string]> = [
        // Cesitli double-encoding senaryolari
        [/Ã§/g, 'ç'], [/Ã‡/g, 'Ç'],
        [/Ã¶/g, 'ö'], [/Ã–/g, 'Ö'],
        [/Ã¼/g, 'ü'], [/Ãœ/g, 'Ü'],
        [/Ä±/g, 'ı'], [/Ä°/g, 'İ'],
        [/ÅŸ/g, 'ş'], [/Å\u009E/g, 'Ş'],
        [/ÄŸ/g, 'ğ'], [/Äž/g, 'Ğ'],
        // Tek baytlik kalintilar (CP1254 byte UTF-8 sanildigi durumda)
        [/Ã /g, 'à'],
      ]

      const fixMojibake = (s: string): string => {
        if (!s || typeof s !== 'string') return s
        let result = s

        // Strateji 1: Bilinen mojibake patternleri direkt replace
        if (/[ÃÄÅÂ]/.test(result)) {
          for (const [pat, rep] of MOJIBAKE_MAP) {
            result = result.replace(pat, rep)
          }
        }

        // Strateji 2: Hala mojibake kaldiysa Latin1->UTF8 reinterpret dene
        if (/[ÃÄÅÂÆÇ][\u0080-\u00FF]/.test(result)) {
          try {
            const bytes = new Uint8Array(result.length)
            for (let i = 0; i < result.length; i++) bytes[i] = result.charCodeAt(i) & 0xff
            const reinterpreted = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
            // Eger reinterpret daha az mojibake iceriyorsa kullan
            const originalBad = (result.match(/[ÃÄÅÂ]/g) || []).length
            const newBad = (reinterpreted.match(/[ÃÄÅÂ]/g) || []).length
            if (newBad < originalBad) result = reinterpreted
          } catch {
            // Devam, en azindan strateji 1 sonucu var
          }
        }

        return result
      }

      let totalRows = 0
      let skippedNoName = 0
      let skippedNoPhone = 0

      const parsed: ContactEntry[] = rows
        .map(row => {
          totalRows++
          // Row icindeki tum string degerleri mojibake'den temizle
          const cleanRow: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(row)) {
            cleanRow[fixMojibake(k)] = typeof v === 'string' ? fixMojibake(v) : v
          }
          const values = extractRuntimeValues(cleanRow, pseudoTpl)
          const name = values.customerName?.trim() || ''
          const phone = (values.customerPhone || '').trim()
          const customer_data: Record<string, string> = {}
          for (const v of effectiveVariables) {
            if (v.key === 'customerName' || v.key === 'customerPhone') continue
            if (values[v.key]) customer_data[v.key] = values[v.key]
          }
          if (!name) skippedNoName++
          if (!phone) skippedNoPhone++
          return { name, phone_number: phone, customer_data }
        })
        .filter(item => item.name && item.phone_number)

      if (parsed.length === 0) {
        // Detayli hata: kullaniciya ne bulamadigimizi soyle
        const firstRow = rows[0] || {}
        const cols = Object.keys(firstRow).slice(0, 5).join(', ')
        toast.error(
          `Geçerli veri bulunamadı. Bulunan sütunlar: "${cols}". ` +
          `Ad/Soyad ve Telefon sütunları gerekli. ` +
          `Boş isim: ${skippedNoName}, boş telefon: ${skippedNoPhone}`,
          { duration: 8000 }
        )
        return
      }

      setContacts(parsed)
      const skipped = totalRows - parsed.length
      if (skipped > 0) {
        toast.success(
          `${parsed.length.toLocaleString('tr-TR')} kişi içe aktarıldı (${skipped} satır eksik isim/telefon nedeniyle atlandı)`,
          { duration: 6000 }
        )
      } else {
        toast.success(`${parsed.length.toLocaleString('tr-TR')} kişi başarıyla içe aktarıldı`)
      }
    } catch (err) {
      console.error('File parse error:', err)
      toast.error('Dosya okunamadı. Lütfen geçerli bir Excel dosyası yükleyin.')
    }
  }, [assistantManifest, effectiveVariables])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await handleFile(file)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) await handleFile(file)
  }

  // Manuel ekleme
  const handleAddManual = () => {
    if (!manualName.trim()) { toast.error('İsim zorunludur'); return }
    if (!manualPhone.trim()) { toast.error('Telefon numarası zorunludur'); return }

    for (const v of extraVariables) {
      if (v.required && !manualExtras[v.key]?.trim()) {
        toast.error(`${v.label} zorunludur`)
        return
      }
    }

    const customer_data: Record<string, string> = {}
    for (const [k, v] of Object.entries(manualExtras)) {
      if (v?.trim()) customer_data[k] = v.trim()
    }

    setContacts(prev => [...prev, {
      name: manualName.trim(),
      phone_number: manualPhone.trim().replace(/\s/g, ''),
      customer_data,
    }])

    setManualName('')
    setManualPhone('')
    setManualExtras({})
    toast.success('Kişi eklendi')
  }

  const removeContact = (idx: number) => {
    setContacts(prev => prev.filter((_, i) => i !== idx))
  }

  // Örnek Excel indir (asistan sectiyse o asistanin sutunlariyla, secmediyse temel sablonla)
  const handleDownloadSample = () => {
    const header: string[] = ['İsim', 'Telefon Numarası']
    const ex1: string[] = ['Ahmet Yılmaz', '05551234567']
    const ex2: string[] = ['Ayşe Demir', '05559876543']
    const ex3: string[] = ['Mehmet Kaya', '05551112233']

    // Asistan secildiyse onun ozel alanlarini da ekle
    for (const v of extraVariables) {
      header.push(v.label)
      ex1.push(v.example || '')
      ex2.push(v.example || '')
      ex3.push(v.example || '')
    }

    const ws = XLSX.utils.aoa_to_sheet([header, ex1, ex2, ex3])
    ws['!cols'] = header.map(h => ({ wch: Math.max(15, h.length + 4) }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Kişiler')

    const guideRows = [
      ['Alan Adı', 'Açıklama', 'Kabul Edilen Sütun Başlıkları', 'Örnek Değer', 'Zorunlu?'],
      ...effectiveVariables.map(v => [
        v.label,
        v.key === 'customerName' ? 'Müşterinin adı/soyadı'
          : v.key === 'customerPhone' ? 'Telefon numarası (+90 ile veya 0 ile başlayabilir)'
          : (v.example || ''),
        (v.excelColumns || [v.key]).join(', '),
        v.example || '',
        v.required ? 'Evet' : 'Hayır',
      ])
    ]
    const guideWs = XLSX.utils.aoa_to_sheet(guideRows)
    guideWs['!cols'] = [{ wch: 22 }, { wch: 40 }, { wch: 40 }, { wch: 25 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, guideWs, 'Sütun Rehberi')

    XLSX.writeFile(wb, `${(formData.name || 'kampanya').replace(/[^\w-]/g, '_')}-ornek.xlsx`)
    toast.success('Örnek Excel dosyası indirildi')
  }

  // Kampanya oluştur (ve opsiyonel olarak başlat)
  const handleCreate = async (startImmediately = false) => {
    if (!formData.name.trim()) { toast.error('Kampanya adı zorunludur'); return }
    if (!formData.assistant_id) { toast.error('Asistan seçimi zorunludur'); return }
    if (sips.length > 0 && !formData.sip_id) {
      toast.error('Aramaların yapılacağı SIP numarasını seçin')
      return
    }
    if (contacts.length === 0) { toast.error('En az 1 kişi eklemelisiniz'); return }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      // sip_id varsa migration 014 uygulanmış olmalı; yoksa hata almamak için fallback
      const insertPayload: Record<string, unknown> = {
        user_id: user?.id,
        name: formData.name,
        assistant_id: formData.assistant_id,
        status: startImmediately ? 'pending' : 'draft',
        total_contacts: contacts.length,
        pending_calls: contacts.length,
        max_concurrent_calls: formData.concurrent_calls,
      }
      if (formData.sip_id) insertPayload.sip_id = formData.sip_id

      let cRes = await supabase
        .from('campaigns')
        .insert(insertPayload)
        .select()
        .single()

      // Migration 014 yoksa sip_id'yi düşür ve tekrar dene
      if (cRes.error && cRes.error.message.includes('sip_id')) {
        delete insertPayload.sip_id
        cRes = await supabase
          .from('campaigns')
          .insert(insertPayload)
          .select()
          .single()
      }

      const { data: campaign, error: cErr } = cRes

      if (cErr) throw cErr

      // Batch insert (büyük listeler için)
      const items = contacts.map((c, i) => ({
        campaign_id: campaign.id,
        customer_name: c.name,
        customer_phone: c.phone_number,
        customer_data: Object.keys(c.customer_data || {}).length > 0 ? c.customer_data : null,
        call_order: i + 1,
        status: 'pending',
      }))

      // Supabase limit ~1000 satır/batch
      const BATCH = 500
      for (let i = 0; i < items.length; i += BATCH) {
        const batch = items.slice(i, i + BATCH)
        const { error: iErr } = await supabase.from('campaign_items').insert(batch)
        if (iErr) throw iErr
      }

      if (startImmediately) {
        const r = await fetch(`/api/campaigns/${campaign.id}/start`, { method: 'POST' })
        if (!r.ok) {
          toast.warning('Kampanya oluşturuldu ama başlatılamadı. Listeden başlatabilirsiniz.')
        } else {
          toast.success(`Kampanya oluşturuldu ve başlatıldı (${contacts.length.toLocaleString('tr-TR')} kişi)`)
        }
      } else {
        toast.success(`Kampanya oluşturuldu (${contacts.length.toLocaleString('tr-TR')} kişi)`)
      }

      router.push(`/dashboard/campaigns/${campaign.id}`)
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Bir hata oluştu'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // SIP yoksa engellemiyoruz (eski davranış için), ama varsa seçim zorunlu
  const sipOk = sips.length === 0 || !!formData.sip_id
  const canCreate = formData.name.trim() && formData.assistant_id && contacts.length > 0 && sipOk

  return (
    <>
      {/* Başlık */}
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard/campaigns">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kampanyalar
            </Button>
          </Link>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Yeni Kampanya</h1>
            <p className="text-sm text-muted-foreground">
              Asistanınızı seçin, kişi listesini yükleyin ve aramaları başlatın
            </p>
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-6 grid gap-6 lg:grid-cols-3">
        {/* SOL: Kampanya Bilgileri */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Kampanya Bilgileri
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-1.5">
                  Kampanya Adı
                  <span className="text-red-500">*</span>
                  <InfoHint
                    variant="info"
                    title="Kampanya Adı"
                    content="Dahili olarak kampanyanızı tanımlamak için kullanılır. Müşteriler bu ismi görmez. **Yaz Kampanyası 2026** veya **Haziran Müşteri Geri Kazanım** gibi anlamlı isimler verin."
                    example="Haziran Müşteri Geri Kazanım"
                  />
                </Label>
                <Input
                  id="name"
                  placeholder="Örn: Haziran Müşteri Geri Kazanım"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Asistan
                  <span className="text-red-500">*</span>
                  <InfoHint
                    variant="info"
                    title="Asistan Seçimi"
                    content="Bu kampanyada aramaları yapacak yapay zeka asistanı. Asistan, ses tonu, sistem promptu ve konuşma akışını belirler. Excel dosyanız seçilen asistanın beklediği sütunlara göre otomatik tanınır."
                  />
                </Label>
                {loadingAssistants ? (
                  <Skeleton className="h-10" />
                ) : assistants.length === 0 ? (
                  <div className="text-center p-4 border rounded-lg bg-muted/30 space-y-2">
                    <Bot className="w-8 h-8 mx-auto text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">Henüz asistanınız yok</p>
                    <Link href="/dashboard/assistant/new">
                      <Button size="sm" variant="outline">Asistan Oluştur</Button>
                    </Link>
                  </div>
                ) : (
                  <Select
                    value={formData.assistant_id}
                    onValueChange={v => setFormData({ ...formData, assistant_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Bir asistan seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {assistants.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                          {a.template_slug && (
                            <span className="text-[10px] text-muted-foreground ml-2">
                              ({a.template_slug.replace(/-/g, ' ')})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* SIP Numarası Seçimi */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Arama Yapılacak Numara
                  <span className="text-red-500">*</span>
                  <InfoHint
                    variant="info"
                    title="SIP Numarası"
                    content="Bu kampanyadaki tüm aramalar **bu numaradan** yapılacak. Müşterinizin arayan numara olarak göreceği SIP hattınız. Birden fazla numaranız varsa kampanyalarınızı farklı numaralardan başlatabilirsiniz."
                  />
                </Label>
                {sips.length === 0 ? (
                  <div className="text-center p-3 border rounded-lg bg-muted/30 space-y-2">
                    <PhoneIcon className="w-6 h-6 mx-auto text-muted-foreground/50" />
                    <p className="text-xs text-muted-foreground">SIP bağlantınız yok</p>
                    <Link href="/dashboard/sip">
                      <Button size="sm" variant="outline">SIP Bağlantısı Ekle</Button>
                    </Link>
                  </div>
                ) : (
                  <Select
                    value={formData.sip_id}
                    onValueChange={v => setFormData({ ...formData, sip_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Bir SIP numarası seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {sips.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          <span className="font-mono">{s.phone_number || 'Numara yok'}</span>
                          {s.name && (
                            <span className="text-[10px] text-muted-foreground ml-2">({s.name})</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {sips.length > 1 && !formData.sip_id && (
                  <p className="text-[10px] text-amber-600">
                    Birden fazla SIP&apos;iniz var, lütfen kullanılacak numarayı seçin.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="concurrent" className="flex items-center gap-1.5">
                  Eşzamanlı Arama
                  <InfoHint
                    variant="info"
                    title="Eşzamanlı Arama Sayısı"
                    content="Aynı anda kaç adet aramanın yapılacağını belirler. Her arama hattı 10 eşzamanlı aramayı destekler. 10 hattınızın hepsini kullanırsanız **100 eşzamanlı aramaya** kadar çıkabilirsiniz.\n\n**Önerilen:** 5-20 arası başlayın. Yüksek değerler hat kapasitenizi zorlayabilir."
                    example="10 (varsayılan)"
                  />
                </Label>
                <Input
                  id="concurrent"
                  type="number"
                  min={1}
                  max={100}
                  value={formData.concurrent_calls}
                  onChange={e => setFormData({
                    ...formData,
                    concurrent_calls: Math.max(1, Math.min(100, parseInt(e.target.value) || 1))
                  })}
                />
                <p className="text-[11px] text-muted-foreground">
                  1 hat ≈ 10 eşzamanlı arama · 10 hat ≈ 100 eşzamanlı arama
                </p>
              </div>

              {/* Asistan seçiliyse manifest özeti */}
              {selectedAssistant && effectiveVariables.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Asistan Excel Sütunları
                  </p>
                  <div className="space-y-1">
                    {effectiveVariables.map(v => (
                      <div key={v.key} className="flex items-center gap-2 text-xs">
                        <Badge variant={v.required ? 'default' : 'outline'} className="text-[9px] px-1.5">
                          {v.required ? 'Zorunlu' : 'Ops.'}
                        </Badge>
                        <span className="font-medium">{v.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Aksiyon butonları */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <Button
                onClick={() => handleCreate(true)}
                disabled={!canCreate || loading}
                size="lg"
                className="w-full"
              >
                <Rocket className="w-4 h-4 mr-2" />
                {loading ? 'İşleniyor...' : `Oluştur ve Hemen Başlat (${contacts.length})`}
              </Button>
              <Button
                onClick={() => handleCreate(false)}
                disabled={!canCreate || loading}
                variant="outline"
                className="w-full"
              >
                Sadece Oluştur (Daha Sonra Başlat)
              </Button>
              {!canCreate && (
                <p className="text-[11px] text-muted-foreground text-center pt-1">
                  {!sipOk
                    ? 'Lütfen kullanılacak SIP numarasını seçin'
                    : 'Kampanya adı, asistan ve en az 1 kişi gerekli'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SAĞ: Kişi Listesi */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-primary" />
                    Kişi Listesi
                    {contacts.length > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {contacts.length.toLocaleString('tr-TR')} kişi
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Toplu (Excel) veya tek tek (manuel) ekleyebilirsiniz
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadSample}
                >
                  <Download className="w-3.5 h-3.5 mr-2" />
                  Örnek Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tab seçici */}
              <div className="flex rounded-lg border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setActiveTab('excel')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === 'excel' ? 'bg-primary text-primary-foreground' : 'bg-muted/30 hover:bg-muted'
                  }`}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel / CSV Yükle
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === 'manual' ? 'bg-primary text-primary-foreground' : 'bg-muted/30 hover:bg-muted'
                  }`}
                >
                  <UserPlus className="h-4 w-4" />
                  Tek Tek Ekle
                </button>
              </div>

              {/* Excel Yükleme */}
              {activeTab === 'excel' && (
                <div className="space-y-4">
                  {/* Format Bildirimi */}
                  <div className="rounded-md border bg-card p-3 flex items-start gap-3">
                    <Wand2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-xs font-semibold">Akıllı Format Tanıma</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Sütun başlıklarınızı endişe etmeyin. Sistem <strong>İsim, Ad, Müşteri, Name</strong>;
                        <strong> Telefon, GSM, Tel, Phone</strong> gibi tüm yaygın isimleri otomatik tanır ve
                        kendi formatına dönüştürür. Türkçe karakterler, büyük-küçük harf ve boşluklar fark etmez.
                      </p>
                    </div>
                  </div>

                  {/* Asistan seçili değilse bilgi (engelleyici degil) */}
                  {!selectedAssistant && assistants.length > 0 && (
                    <div className="rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 flex items-start gap-3">
                      <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-800 dark:text-blue-200">
                        Ipucu: Sol panelden <strong>Asistan</strong> secerseniz, Excel sutunlariniz o asistanin
                        ozel alanlariyla otomatik eslestirilir. Asistan secmeden de yukleyebilirsiniz (sadece
                        Isim + Telefon yeterlidir).
                      </p>
                    </div>
                  )}
                  {assistants.length === 0 && (
                    <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 p-3 flex items-start gap-3">
                      <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                      <div className="flex-1 space-y-1">
                        <p className="text-xs text-yellow-800 dark:text-yellow-200">
                          Henuz bir <strong>asistan</strong> olusturmadiniz. Kampanyayi baslatmak icin en az
                          bir asistan gerekiyor. Excel yuklemeyi simdi yapabilirsiniz.
                        </p>
                        <Link href="/dashboard/assistant/new">
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            <Bot className="w-3 h-3 mr-1" />
                            Asistan Olustur
                          </Button>
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* Drop Zone - HER ZAMAN AKTIF */}
                  <label
                    htmlFor="file-upload"
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`block border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
                      isDragging
                        ? 'border-primary bg-primary/5 scale-[1.01]'
                        : 'border-border hover:border-primary/50 hover:bg-muted/30'
                    }`}
                  >
                    <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium mb-1">
                      Dosyayı buraya bırakın veya <span className="text-primary underline">seçmek için tıklayın</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Excel (.xlsx, .xls) veya CSV · Maksimum 100.000 kişi
                    </p>
                    <Input
                      id="file-upload"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>

                  {uploadedFile && (
                    <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3 flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100 truncate">
                          {uploadedFile.name}
                        </p>
                        <p className="text-xs text-emerald-700 dark:text-emerald-300">
                          {contacts.length.toLocaleString('tr-TR')} kişi başarıyla içe aktarıldı
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Manuel Ekleme */}
              {activeTab === 'manual' && (
                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="manual-name" className="text-xs mb-1 block">İsim *</Label>
                      <Input
                        id="manual-name"
                        placeholder="Ahmet Yılmaz"
                        value={manualName}
                        onChange={e => setManualName(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="manual-phone" className="text-xs mb-1 block">Telefon *</Label>
                      <Input
                        id="manual-phone"
                        placeholder="05551234567"
                        value={manualPhone}
                        onChange={e => setManualPhone(e.target.value)}
                      />
                    </div>
                    {extraVariables.map(v => (
                      <div key={v.key} className="sm:col-span-1">
                        <Label htmlFor={`manual-${v.key}`} className="text-xs mb-1 block">
                          {v.label} {v.required && '*'}
                        </Label>
                        <Input
                          id={`manual-${v.key}`}
                          placeholder={v.example || ''}
                          value={manualExtras[v.key] || ''}
                          onChange={e => setManualExtras({ ...manualExtras, [v.key]: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                  <Button onClick={handleAddManual} variant="outline" className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Kişiyi Listeye Ekle
                  </Button>
                </div>
              )}

              {/* Yüklenen kişiler önizleme */}
              {contacts.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      Yüklenen Kişiler ({contacts.length.toLocaleString('tr-TR')})
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-7"
                      onClick={() => {
                        setContacts([])
                        setUploadedFile(null)
                        toast.info('Liste temizlendi')
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Tümünü Sil
                    </Button>
                  </div>

                  <div className="border rounded-md overflow-x-auto max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-2 w-8 text-xs">#</th>
                          <th className="text-left px-2 py-2 text-xs">İsim</th>
                          <th className="text-left px-2 py-2 text-xs">Telefon</th>
                          {extraVariables.map(v => (
                            <th key={v.key} className="text-left px-2 py-2 text-xs">{v.label}</th>
                          ))}
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {contacts.slice(0, 100).map((c, i) => (
                          <tr key={i} className="border-t hover:bg-muted/30 transition-colors">
                            <td className="px-2 py-1.5 text-muted-foreground text-xs">{i + 1}</td>
                            <td className="px-2 py-1.5">{c.name}</td>
                            <td className="px-2 py-1.5 font-mono text-xs">{c.phone_number}</td>
                            {extraVariables.map(v => (
                              <td key={v.key} className="px-2 py-1.5 text-muted-foreground text-xs">
                                {c.customer_data?.[v.key] || '—'}
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-right">
                              <button
                                type="button"
                                onClick={() => removeContact(i)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {contacts.length > 100 && (
                      <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground text-center border-t">
                        İlk 100 kişi gösteriliyor · Toplam {contacts.length.toLocaleString('tr-TR')} kişi
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bilgi kutusu - SIP hatırlatma */}
          {selectedAssistant && (
            <div className="rounded-md border bg-card p-3 flex items-start gap-3">
              <PhoneIcon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-xs font-semibold">Arama Çıkış Numarası</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Aramalar <strong>SIP ayarlarınızdaki numara</strong> üzerinden otomatik yapılır. Kampanya başladığında
                  10 hattınız aynı anda paralel olarak çalışır — bu sayede {formData.concurrent_calls} eşzamanlı aramaya kadar erişebilirsiniz.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
