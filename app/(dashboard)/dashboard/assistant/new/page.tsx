'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoHint } from '@/components/ui/info-hint'
import { Sparkles, ArrowRight, ArrowLeft, CheckCircle2, Wand2, Eye, Search } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import type { AssistantTemplate, TemplateField, RuntimeVariable } from '@/lib/assistant-templates'
import { BUILTIN_RUNTIME_VARIABLES } from '@/lib/assistant-templates'

type Step = 'industry' | 'usecase' | 'fill' | 'preview'

interface Industry {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  color: string
  template_count: number
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'industry', label: 'Sektör' },
  { id: 'usecase', label: 'Kullanım' },
  { id: 'fill', label: 'Doldur' },
  { id: 'preview', label: 'Önizle' },
]

export default function NewAssistantWizardPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('industry')
  const [industries, setIndustries] = useState<Industry[]>([])
  const [templates, setTemplates] = useState<AssistantTemplate[]>([])
  const [loadingIndustries, setLoadingIndustries] = useState(true)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedIndustry, setSelectedIndustry] = useState<Industry | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<AssistantTemplate | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [customName, setCustomName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Industries yükle
  useEffect(() => {
    fetch('/api/industries')
      .then(r => r.json())
      .then(d => {
        if (d.success) setIndustries(d.industries)
        setLoadingIndustries(false)
      })
      .catch(() => setLoadingIndustries(false))
  }, [])

  // Industry seçilince template'leri çek
  useEffect(() => {
    if (!selectedIndustry) return
    setLoadingTemplates(true)
    fetch(`/api/assistant-templates?industry_id=${selectedIndustry.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setTemplates(d.templates)
        setLoadingTemplates(false)
      })
      .catch(() => setLoadingTemplates(false))
  }, [selectedIndustry])

  const handleSelectIndustry = (industry: Industry) => {
    setSelectedIndustry(industry)
    setStep('usecase')
  }

  const handleSelectTemplate = (template: AssistantTemplate) => {
    setSelectedTemplate(template)
    const initialValues: Record<string, string> = {}
    template.fields.forEach((f: TemplateField) => {
      initialValues[f.id] = f.default || ''
    })
    setValues(initialValues)
    setCustomName('')
    setStep('fill')
  }

  const handleNextToPreview = () => {
    if (!selectedTemplate) return
    const missing = selectedTemplate.fields
      .filter((f: TemplateField) => f.required && !values[f.id]?.trim() && !f.default)
      .map((f: TemplateField) => f.label)

    if (missing.length > 0) {
      toast.error(`Zorunlu alanlar boş: ${missing.join(', ')}`)
      return
    }
    setStep('preview')
  }

  const handleCreate = async () => {
    if (!selectedTemplate) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/assistant-templates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          values,
          customName: customName || values.ASSISTANT_NAME || selectedTemplate.name,
        }),
      })
      const data = await res.json()
      if (data.success) {
        const success = data.provisioning?.successful || 0
        const total = data.provisioning?.total || 10
        toast.success(`Asistan oluşturuldu — ${success}/${total} arama hattına başarıyla kuruldu`)
        setTimeout(() => router.push('/dashboard/assistant'), 1500)
      } else {
        toast.error(data.error || 'Oluşturulamadı')
      }
    } catch {
      toast.error('Hata oluştu')
    } finally {
      setSubmitting(false)
    }
  }

  const stepIndex = STEPS.findIndex(s => s.id === step)

  // Filtrelenmiş template'ler
  const filteredTemplates = templates.filter(t =>
    !searchQuery ||
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <>
      {/* HEADER */}
      <div className="px-4 lg:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Wand2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Yeni Asistan Oluştur</h1>
              <p className="text-sm text-muted-foreground">4 adımda profesyonel bir AI asistan</p>
            </div>
          </div>
          <Link href="/dashboard/assistant">
            <Button variant="ghost">İptal</Button>
          </Link>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        {/* STEP INDICATOR */}
        <div className="flex items-center justify-center gap-2 mb-6 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <button
                onClick={() => i < stepIndex && setStep(s.id)}
                disabled={i > stepIndex}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  step === s.id
                    ? 'bg-primary text-primary-foreground scale-110'
                    : i < stepIndex
                    ? 'bg-green-500 text-white cursor-pointer hover:scale-105'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < stepIndex ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </button>
              <span className={`text-sm ${step === s.id ? 'font-semibold' : 'text-muted-foreground'}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* STEP 1: SEKTÖR */}
        {step === 'industry' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Hangi sektördesiniz?
                </CardTitle>
                <CardDescription>
                  Sektörünüzü seçin, size özel hazırlanmış asistan şablonlarını gösterelim.
                </CardDescription>
              </CardHeader>
            </Card>

            {loadingIndustries ? (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-32" />)}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                {industries.map(ind => (
                  <button
                    key={ind.id}
                    onClick={() => handleSelectIndustry(ind)}
                    className="group p-4 rounded-xl border-2 border-muted hover:border-primary hover:shadow-md transition-all text-left bg-card"
                  >
                    <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">{ind.icon}</div>
                    <h3 className="font-semibold text-sm">{ind.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ind.description}</p>
                    <Badge variant="outline" className="text-[10px] mt-2">
                      {ind.template_count} hazır şablon
                    </Badge>
                  </button>
                ))}
              </div>
            )}

            <Card className="border-dashed">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Sektörünüz listede yok mu?</p>
                  <p className="text-xs text-muted-foreground">Gelişmiş manuel oluşturmaya geçebilirsiniz</p>
                </div>
                <Link href="/dashboard/assistant">
                  <Button variant="outline" size="sm">Manuel Oluştur</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        )}

        {/* STEP 2: USE CASE */}
        {step === 'usecase' && selectedIndustry && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">{selectedIndustry.icon}</div>
                    <div>
                      <CardTitle>{selectedIndustry.name}</CardTitle>
                      <CardDescription>Bu sektör için hazır asistan şablonlarından birini seçin.</CardDescription>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setStep('industry')}>
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                    Geri
                  </Button>
                </div>

                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Şablonlar içinde ara..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardHeader>
            </Card>

            {loadingTemplates ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
              </div>
            ) : filteredTemplates.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground mb-2">
                    {searchQuery ? 'Aramanıza uygun şablon bulunamadı' : 'Bu sektörde henüz şablon yok'}
                  </p>
                  <Link href="/dashboard/assistant">
                    <Button variant="outline" size="sm">Manuel Oluştur</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredTemplates.map(t => (
                  <Card
                    key={t.id}
                    className="cursor-pointer hover:border-primary hover:shadow-md transition-all"
                    onClick={() => handleSelectTemplate(t)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="text-4xl">{t.icon}</div>
                        {t.is_featured && (
                          <Badge className="bg-primary text-[10px]">Önerilen</Badge>
                        )}
                      </div>
                      <CardTitle className="text-base mt-2">{t.name}</CardTitle>
                      <CardDescription className="text-xs leading-relaxed">
                        {t.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{t.fields.length} alan</span>
                        {t.usage_count > 0 && <span>{t.usage_count} kullanım</span>}
                      </div>
                      <Button className="w-full mt-3" variant="outline" size="sm">
                        Bu Şablonu Seç
                        <ArrowRight className="w-3.5 h-3.5 ml-2" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: DOLDUR */}
        {step === 'fill' && selectedTemplate && (
          <div className="space-y-4 max-w-3xl mx-auto">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="text-4xl">{selectedTemplate.icon}</div>
                  <div>
                    <CardTitle>{selectedTemplate.name}</CardTitle>
                    <CardDescription>{selectedTemplate.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-primary/10 p-2 shrink-0">
                      <Sparkles className="w-4 h-4 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">Yapılandırma Bilgilendirmesi</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Bu adımda yalnızca asistanınızın kimlik bilgilerini girmeniz yeterlidir.
                        Sistem prompt, ses motoru, model parametreleri ve transkripsiyon ayarları
                        Voiceturko mühendislik ekibi tarafından sektörünüze özel optimize edilmiş şekilde otomatik uygulanır.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Her alanın yanındaki <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">i</kbd> simgesine tıklayarak detaylı kullanım kılavuzunu inceleyebilirsiniz.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Asistan İsmi
                    <span className="text-[10px] text-muted-foreground font-normal">(Sadece sizin görüntülemeniz için)</span>
                    <InfoHint
                      variant="info"
                      title="Dahili Asistan Adı"
                      content="Bu isim **yalnızca yönetim panelinizde** görüntülenir. Müşterileriniz bu ismi duymaz. Birden fazla asistanınız varsa hangi kampanya için hangi asistanı oluşturduğunuzu hatırlamak için anlamlı bir isim verin."
                      example={`${selectedTemplate.name} - ${new Date().toLocaleDateString('tr-TR')}`}
                    />
                  </Label>
                  <Input
                    placeholder={`Örn: ${selectedTemplate.name} - v1`}
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                  />
                </div>

                <hr />

                {selectedTemplate.fields.map((field: TemplateField) => (
                  <div key={field.id} className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      {field.label}
                      {field.required && (
                        <span className="text-red-500" aria-label="Zorunlu alan">*</span>
                      )}
                      <InfoHint
                        variant="info"
                        title={field.label}
                        content={field.help || 'Bu alan için detaylı açıklama bulunmamaktadır.'}
                        example={field.placeholder}
                      />
                    </Label>
                    {field.type === 'textarea' ? (
                      <Textarea
                        placeholder={field.placeholder}
                        value={values[field.id] || ''}
                        onChange={e => setValues({ ...values, [field.id]: e.target.value })}
                        rows={3}
                      />
                    ) : (
                      <Input
                        type={field.type === 'number' ? 'number' : 'text'}
                        placeholder={field.placeholder}
                        value={values[field.id] || ''}
                        onChange={e => setValues({ ...values, [field.id]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep('usecase')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Şablon Değiştir
              </Button>
              <Button onClick={handleNextToPreview}>
                Önizlemeye Geç
                <Eye className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: ÖNIZLE */}
        {step === 'preview' && selectedTemplate && (
          <div className="space-y-4 max-w-3xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" />
                  Önizleme
                </CardTitle>
                <CardDescription>Asistan oluşturulmadan önce bilgilerinizi kontrol edin</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Sektör & Şablon</p>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{selectedIndustry?.icon}</span>
                    <span className="text-sm font-medium">{selectedIndustry?.name}</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="text-2xl">{selectedTemplate.icon}</span>
                    <span className="font-semibold">{selectedTemplate.name}</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Dashboard&apos;da görünecek isim</p>
                  <p className="font-medium">{customName || values.ASSISTANT_NAME || selectedTemplate.name}</p>
                </div>

                <hr />

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Doldurulan Alanlar</p>
                  {selectedTemplate.fields.map((f: TemplateField) => (
                    <div key={f.id} className="flex items-start justify-between text-sm py-1 border-b last:border-b-0">
                      <span className="text-muted-foreground">{f.label}:</span>
                      <span className="font-medium text-right max-w-[60%]">
                        {values[f.id] || f.default || <span className="text-muted-foreground italic">boş</span>}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Runtime Variables Manifest */}
                {(() => {
                  const customVars: RuntimeVariable[] = Array.isArray(selectedTemplate.template?.runtimeVariables)
                    ? (selectedTemplate.template.runtimeVariables as RuntimeVariable[])
                    : []
                  const seen = new Set<string>()
                  const allVars: RuntimeVariable[] = []
                  for (const v of customVars) { if (!seen.has(v.key)) { allVars.push(v); seen.add(v.key) } }
                  for (const v of BUILTIN_RUNTIME_VARIABLES) { if (!seen.has(v.key)) { allVars.push(v); seen.add(v.key) } }

                  return (
                    <div className="rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 p-3 space-y-2">
                      <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                        Kampanyada Excel&apos;den alınacak bilgiler
                      </p>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {allVars.map(v => (
                          <div key={v.key} className="flex items-start gap-1.5 text-[11px]">
                            <Badge variant={v.required ? 'default' : 'outline'} className="shrink-0 text-[9px] px-1">
                              {v.required ? 'Zorunlu' : 'Ops.'}
                            </Badge>
                            <div className="min-w-0">
                              <p className="font-medium text-blue-900 dark:text-blue-100">{v.label}</p>
                              {v.example && (
                                <p className="text-blue-700 dark:text-blue-300 italic truncate">örn: {v.example}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-blue-700 dark:text-blue-300 italic">
                        Excel kolonu başlığı: {'İsim, Telefon'}{allVars.filter(v => !v.builtin).length > 0 ? `, ${allVars.filter(v => !v.builtin).map(v => v.label).join(', ')}` : ''}
                      </p>
                    </div>
                  )
                })()}

                <div className="rounded-md border bg-card p-3 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Oluşturulduktan sonra
                  </div>
                  <ul className="text-muted-foreground space-y-1 ml-6 list-disc">
                    <li>Asistan veritabanınıza kaydedilir</li>
                    <li>10 arama hattınıza otomatik kurulur (yaklaşık 30 saniye)</li>
                    <li>Anında kampanya başlatabilirsiniz; her görüşmede müşteri bilgileri otomatik kullanılır</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep('fill')} disabled={submitting}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Düzenle
              </Button>
              <Button onClick={handleCreate} disabled={submitting} size="lg">
                <Sparkles className="w-4 h-4 mr-2" />
                {submitting ? 'Oluşturuluyor...' : 'Asistanı Oluştur'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
