'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Bot, Save, Plus, Trash2, Wand2, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export default function AssistantPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [assistants, setAssistants] = useState<any[]>([])
  const [selectedAssistant, setSelectedAssistant] = useState<any>(null)
  const [formData, setFormData] = useState({
    name: '',
    first_message_mode: 'assistant' as 'assistant' | 'user',
    first_message: '',
    system_prompt: '',
    summary_prompt: '',
  })
  const supabase = createClient()

  useEffect(() => {
    loadAssistants()
  }, [])

  const loadAssistants = async () => {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data } = await supabase
      .from('assistant')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false })

    if (data && data.length > 0) {
      setAssistants(data)
      selectAssistant(data[0])
    } else {
      setAssistants([])
      setSelectedAssistant(null)
    }
    setLoading(false)
  }

  const selectAssistant = (assistant: any) => {
    setSelectedAssistant(assistant)
    setFormData({
      name: assistant.name || '',
      first_message_mode: assistant.first_message_mode,
      first_message: assistant.first_message || '',
      system_prompt: assistant.system_prompt || '',
      summary_prompt: assistant.summary_prompt || '',
    })
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Asistan adı gerekli')
      return
    }

    setSaving(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    try {
      let savedAssistantId = selectedAssistant?.id

      if (selectedAssistant) {
        // Güncelle - migration uygulanmadıysa summary_prompt'u düşür ve tekrar dene
        let { error } = await supabase
          .from('assistant')
          .update(formData)
          .eq('id', selectedAssistant.id)

        let usedFallback = false
        if (error && error.message.includes('summary_prompt')) {
          // Migration uygulanmamış - bu alanı atla
          const { summary_prompt, ...formDataWithoutSummary } = formData
          void summary_prompt
          const retry = await supabase
            .from('assistant')
            .update(formDataWithoutSummary)
            .eq('id', selectedAssistant.id)
          error = retry.error
          usedFallback = true
        }

        if (error) throw error
        if (usedFallback) {
          toast.warning('Asistan güncellendi (Özet Kişiliği için DB migration gerekli)')
        } else {
          toast.success('Asistan güncellendi')
        }
      } else {
        // Default ayarları çek
        const { data: defaultSettings } = await supabase
          .from('default_assistant_settings')
          .select('*')
          .single()

        // Yeni oluştur - default ayarlarla birlikte
        const insertPayload = {
          user_id: user?.id,
          ...formData,
          ai_provider: defaultSettings?.ai_provider || 'openai',
          ai_model: defaultSettings?.ai_model || 'gpt-4o',
          elevenlabs_voice_id: defaultSettings?.elevenlabs_voice_id || 'pNInz6obpgDQGcFmaJgB',
          elevenlabs_model: defaultSettings?.elevenlabs_model || 'eleven_turbo_v2_5',
        }

        let { data: newAst, error } = await supabase
          .from('assistant')
          .insert(insertPayload)
          .select()
          .single()

        if (error && error.message.includes('summary_prompt')) {
          // Migration uygulanmamış - bu alanı atla
          const { summary_prompt, ...payloadWithoutSummary } = insertPayload
          void summary_prompt
          const retry = await supabase
            .from('assistant')
            .insert(payloadWithoutSummary)
            .select()
            .single()
          newAst = retry.data
          error = retry.error
        }

        if (error) throw error
        savedAssistantId = newAst.id
        toast.success('Asistan oluşturuldu')
      }

      // Arka planda senkronize et
      if (savedAssistantId) {
        try {
          await fetch('/api/vapi/assistants/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assistantId: savedAssistantId })
          })
        } catch {
          // Senkronizasyon hatası sessizce loglanır, kullanıcıya gösterilmez
          console.error('Asistan senkronizasyon hatası')
        }
      }

      await loadAssistants()
    } catch (error: any) {
      toast.error(error.message || 'Bir hata oluştu')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedAssistant) return

    const deletePromise = async () => {
      // VAPI'den de temizlenmesi için API endpoint'i kullan
      const res = await fetch(`/api/assistant?id=${selectedAssistant.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Silme başarısız')
      await loadAssistants()
      return data
    }

    toast.promise(deletePromise(), {
      loading: 'Asistan ve arama hatlar\u0131ndaki kopyalar\u0131 temizleniyor...',
      success: (data) => data.message || 'Asistan ve tüm hatlardaki kopyalar silindi',
      error: (err) => err.message || 'Silme sırasında hata oluştu',
    })
  }

  const handleNewAssistant = () => {
    setSelectedAssistant(null)
    setFormData({
      name: '',
      first_message_mode: 'assistant',
      first_message: '',
      system_prompt: '',
      summary_prompt: '',
    })
  }

  if (loading) {
    return (
      <div className="px-4 lg:px-6 space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  const handleResyncAll = async () => {
    const resyncPromise = async () => {
      const res = await fetch('/api/assistant/resync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Senkronizasyon başarısız')
      return data
    }

    toast.promise(resyncPromise(), {
      loading: 'Asistanlar arama altyapısına yeniden gönderiliyor...',
      success: (data) => data.message || 'Tüm asistanlar başarıyla yenilendi',
      error: (err) => err.message || 'Senkronizasyon sırasında hata oluştu',
    })
  }

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Asistan Ayarları</h1>
            <p className="text-muted-foreground">AI asistanlarınızı yönetin</p>
          </div>
          {assistants.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResyncAll}
              title="Asistanları arama altyapısına yeniden gönderir (Türkçe karakter veya prompt güncellemesi sonrası kullanın)"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Tümünü Yenile
            </Button>
          )}
        </div>
      </div>

      <div className="px-4 lg:px-6">
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* Sol Taraf - Asistan Listesi */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Asistanlar</CardTitle>
                <div className="flex gap-1">
                  <Button size="sm" variant="default" asChild>
                    <Link href="/dashboard/assistant/new">
                      <Wand2 className="h-3.5 w-3.5 mr-1" />
                      Şablon
                    </Link>
                  </Button>
                  <Button size="icon" variant="outline" onClick={handleNewAssistant} title="Manuel">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <div className="space-y-1 p-4">
                  {assistants.length === 0 ? (
                    <div className="text-center py-8">
                      <Bot className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground mb-2">
                        Henüz asistan yok
                      </p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Şablondan hızlı başla veya manuel oluştur
                      </p>
                      <Button
                        size="sm"
                        className="mt-4"
                        asChild
                      >
                        <Link href="/dashboard/assistant/new">
                          <Wand2 className="mr-2 h-4 w-4" />
                          Şablondan Oluştur
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={handleNewAssistant}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        İlk Asistanı Oluştur
                      </Button>
                    </div>
                  ) : (
                    assistants.map((assistant) => (
                      <button
                        key={assistant.id}
                        onClick={() => selectAssistant(assistant)}
                        className={cn(
                          'w-full text-left p-3 rounded-lg transition-colors',
                          'hover:bg-accent',
                          selectedAssistant?.id === assistant.id
                            ? 'bg-accent'
                            : 'bg-transparent'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <Bot className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {assistant.name || 'İsimsiz Asistan'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {assistant.ai_model || 'Model belirtilmemiş'}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Sağ Taraf - Asistan Detayları */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    {selectedAssistant ? 'Asistan Düzenle' : 'Yeni Asistan'}
                  </CardTitle>
                  <CardDescription>
                    Asistanın davranışını ve sesini özelleştirin
                  </CardDescription>
                </div>
                {selectedAssistant && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Emin misiniz?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Bu asistanı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>İptal</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>
                          Sil
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Asistan Adı</Label>
                <Input
                  id="name"
                  placeholder="Örn: Müşteri Hizmetleri Asistanı"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>İlk Mesaj Modu</Label>
                <RadioGroup
                  value={formData.first_message_mode}
                  onValueChange={(value: 'assistant' | 'user') =>
                    setFormData({ ...formData, first_message_mode: value })
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="assistant" id="assistant" />
                    <Label htmlFor="assistant" className="font-normal cursor-pointer">
                      Asistan konuşmayı başlatır
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="user" id="user" />
                    <Label htmlFor="user" className="font-normal cursor-pointer">
                      Kullanıcı konuşmayı başlatır
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="first_message">İlk Mesaj</Label>
                <Textarea
                  id="first_message"
                  placeholder="Merhaba, size nasıl yardımcı olabilirim?"
                  value={formData.first_message}
                  onChange={(e) =>
                    setFormData({ ...formData, first_message: e.target.value })
                  }
                  rows={3}
                />
                <p className="text-sm text-muted-foreground">
                  Asistanın konuşmaya başlarken söyleyeceği ilk mesaj
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="system_prompt">Sistem Promptu</Label>
                <Textarea
                  id="system_prompt"
                  placeholder="Sen yardımsever bir müşteri hizmetleri asistanısın..."
                  value={formData.system_prompt}
                  onChange={(e) =>
                    setFormData({ ...formData, system_prompt: e.target.value })
                  }
                  rows={6}
                />
                <p className="text-sm text-muted-foreground">
                  Asistanın davranışını ve kişiliğini tanımlayan prompt.
                  <br />
                  <span className="text-xs">
                    <strong>Otomatik:</strong> Rakamlar (örn. <code className="text-[10px]">3</code>, <code className="text-[10px]">14:30</code>, <code className="text-[10px]">100 TL</code>) arama yapılırken otomatik olarak yazıya çevrilir (<code className="text-[10px]">üç</code>, <code className="text-[10px]">saat on dört otuz</code>, <code className="text-[10px]">yüz lira</code>) — sesli okumada daha doğal.
                  </span>
                </p>
              </div>

              {/* Özet Kişiliği */}
              <div className="space-y-2 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <Label htmlFor="summary_prompt" className="text-base font-semibold">
                    Özet Kişiliği
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setFormData({
                      ...formData,
                      summary_prompt: `Sen profesyonel bir arama analisti asistansın. Verilen telefon görüşmesi transkriptini AŞAĞIDAKİ KURALLARA göre özetle:\n\n[Dil]\n- SADECE TÜRKÇE yaz. Asla İngilizce veya başka bir dil kullanma.\n- Akıcı, net, profesyonel Türkçe.\n\n[İçerik]\n1. KİMLER KONUŞTU: Asistan ve müşterinin isimleri (varsa)\n2. GÖRÜŞMENİN ÖZÜ: 2-3 cümlede ne konuşulduğu\n3. SONUÇ: Müşterinin verdiği yanıt veya alınan karar (kabul/red/erteleme)\n4. ÖNEMLİ NOTLAR: Müşterinin belirttiği özel bilgiler (varsa)\n\n[Format]\n- Markdown veya başlık KULLANMA, sadece düz metin.\n- 3-5 cümle yeterli.\n- Soyut/yorum YOK; sadece transkriptte geçen olgular.\n\n[Yasaklar]\n- "Customer", "Agent", "AI assistant" gibi İngilizce terim YOK.\n- "Müşteri", "Asistan", "Görüşme" kullan.\n- Tahmin yapma, sadece transkriptte geçenleri yaz.`
                    })}
                  >
                    Varsayılanı Yükle
                  </Button>
                </div>
                <Textarea
                  id="summary_prompt"
                  placeholder="Arama bittiğinde transkripti özetleyecek asistanın kişiliği. Boş bırakırsanız sistem varsayılan Türkçe özet kişiliğini kullanır."
                  value={formData.summary_prompt}
                  onChange={(e) =>
                    setFormData({ ...formData, summary_prompt: e.target.value })
                  }
                  rows={8}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Her arama bittikten sonra transkript bu kişiliğe göre özetlenir.
                  Özet <strong>Çağrılar</strong> sayfasında görünür ve toplu Excel/PDF olarak indirilebilir.
                  Boş bırakırsanız varsayılan Türkçe özet kişiliği kullanılır.
                </p>
              </div>


              <Button onClick={handleSave} disabled={saving} className="w-full">
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Kaydediliyor...' : selectedAssistant ? 'Güncelle' : 'Oluştur'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}