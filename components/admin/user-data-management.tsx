'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

// Assistant Management
interface AssistantFormProps {
  userId: string
  assistant?: any
  onSuccess: () => void
}

export function AssistantForm({ userId, assistant, onSuccess }: AssistantFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const getInitialFormData = () => ({
    name: assistant?.name || '',
    firstMessageMode: assistant?.first_message_mode || 'assistant',
    firstMessage: assistant?.first_message || '',
    systemPrompt: assistant?.system_prompt || '',
    aiProvider: assistant?.ai_provider || 'openai',
    aiModel: assistant?.ai_model || '',
    temperature: assistant?.temperature ?? 0.7,
    maxTokens: assistant?.max_tokens ?? 3000,
    elevenlabsVoiceId: assistant?.elevenlabs_voice_id || '',
    elevenlabsModel: assistant?.elevenlabs_model || '',
    voiceSpeed: assistant?.voice_speed ?? 1.0,
    voiceStability: assistant?.voice_stability ?? 0.5,
    voiceSimilarityBoost: assistant?.voice_similarity_boost ?? 0.75,
    endCallMessage: assistant?.end_call_message || '',
    voicemailMessage: assistant?.voicemail_message || '',
    backgroundSound: assistant?.background_sound || 'office',
    endCallToolEnabled: assistant?.end_call_tool_enabled ?? false,
    stopSpeakingNumWords: assistant?.stop_speaking_num_words ?? 3,
    stopSpeakingVoiceSeconds: assistant?.stop_speaking_voice_seconds ?? 0.2,
    stopSpeakingBackoffSeconds: assistant?.stop_speaking_backoff_seconds ?? 0,
  })
  
  const [formData, setFormData] = useState(getInitialFormData)
  
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setFormData(getInitialFormData())
    }
    setOpen(isOpen)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const url = '/api/admin/assistant'
      const method = assistant ? 'PUT' : 'POST'
      
      let body
      if (assistant) {
        body = { id: assistant.id, ...formData }
      } else {
        const defaultResponse = await fetch('/api/admin/default-settings')
        const defaultData = await defaultResponse.json()
        
        body = {
          userId,
          ...formData,
          aiProvider: formData.aiProvider || defaultData.ai_provider || 'openai',
          aiModel: formData.aiModel || defaultData.ai_model || 'gpt-4o',
          elevenlabsVoiceId: formData.elevenlabsVoiceId || defaultData.elevenlabs_voice_id || 'pNInz6obpgDQGcFmaJgB',
          elevenlabsModel: formData.elevenlabsModel || defaultData.elevenlabs_model || 'eleven_turbo_v2_5'
        }
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (response.ok) {
        toast.success(assistant ? 'Asistan güncellendi' : 'Asistan oluşturuldu')
        setOpen(false)
        router.refresh()
        onSuccess()
      } else {
        const data = await response.json().catch(() => ({}))
        toast.error(data.error || 'İşlem başarısız')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {assistant ? (
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Yeni Asistan
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{assistant ? 'Asistan Düzenle' : 'Yeni Asistan'}</DialogTitle>
          <DialogDescription>AI asistan yap\u0131land\u0131rmas\u0131</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Temel Bilgiler */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Temel</h4>
            <div className="space-y-2">
              <Label htmlFor="name">Asistan Adı</Label>
              <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstMessageMode">İlk Mesaj Modu</Label>
                <Select value={formData.firstMessageMode} onValueChange={(value) => setFormData({ ...formData, firstMessageMode: value })}>
                  <SelectTrigger id="firstMessageMode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assistant">Asistan Başlatır</SelectItem>
                    <SelectItem value="user">Kullanıcı Başlatır</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="backgroundSound">Arka Plan Sesi</Label>
                <Select value={formData.backgroundSound} onValueChange={(value) => setFormData({ ...formData, backgroundSound: value })}>
                  <SelectTrigger id="backgroundSound"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Kapalı</SelectItem>
                    <SelectItem value="office">Ofis</SelectItem>
                    <SelectItem value="static">Statik</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Mesajlar */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Mesajlar</h4>
            <div className="space-y-2">
              <Label htmlFor="firstMessage">İlk Mesaj</Label>
              <Textarea id="firstMessage" value={formData.firstMessage} onChange={(e) => setFormData({ ...formData, firstMessage: e.target.value })} rows={2} placeholder="Merhaba {{customerName}} ile mi görüşüyorum?" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="endCallMessage">Arama Sonu Mesajı</Label>
                <Input id="endCallMessage" value={formData.endCallMessage} onChange={(e) => setFormData({ ...formData, endCallMessage: e.target.value })} placeholder="Görüşmek üzere!" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="voicemailMessage">Sesli Mesaj</Label>
                <Input id="voicemailMessage" value={formData.voicemailMessage} onChange={(e) => setFormData({ ...formData, voicemailMessage: e.target.value })} placeholder="Uygun olduğunuzda arayabilir miyim?" />
              </div>
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea id="systemPrompt" value={formData.systemPrompt} onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })} rows={6} placeholder="Asistanın davranışını tanımlayan prompt..." />
          </div>

          {/* AI Model */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">AI Model</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="aiProvider">Provider</Label>
                <Select value={formData.aiProvider} onValueChange={(value) => setFormData({ ...formData, aiProvider: value })}>
                  <SelectTrigger id="aiProvider"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google">Google (Gemini)</SelectItem>
                    <SelectItem value="groq">Groq</SelectItem>
                    <SelectItem value="together-ai">Together AI</SelectItem>
                    <SelectItem value="openrouter">OpenRouter</SelectItem>
                    <SelectItem value="azure-openai">Azure OpenAI</SelectItem>
                    <SelectItem value="vapi">Voiceturko</SelectItem>
                    <SelectItem value="custom-llm">Custom LLM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="aiModel">Model</Label>
                <Input id="aiModel" value={formData.aiModel} onChange={(e) => setFormData({ ...formData, aiModel: e.target.value })} placeholder="gpt-4o" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="temperature">Temperature ({formData.temperature})</Label>
                <Input id="temperature" type="number" step="0.1" min="0" max="2" value={formData.temperature} onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) || 0.7 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxTokens">Max Tokens</Label>
                <Input id="maxTokens" type="number" min="100" max="128000" value={formData.maxTokens} onChange={(e) => setFormData({ ...formData, maxTokens: parseInt(e.target.value) || 3000 })} />
              </div>
            </div>
          </div>

          {/* Ses Ayarları */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Ses (ElevenLabs)</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="elevenlabsVoiceId">Voice ID</Label>
                <Input id="elevenlabsVoiceId" value={formData.elevenlabsVoiceId} onChange={(e) => setFormData({ ...formData, elevenlabsVoiceId: e.target.value })} placeholder="oPC5I9GKjMReiaM29gjY" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="elevenlabsModel">Model</Label>
                <Input id="elevenlabsModel" value={formData.elevenlabsModel} onChange={(e) => setFormData({ ...formData, elevenlabsModel: e.target.value })} placeholder="eleven_v3" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="voiceSpeed">Hız ({formData.voiceSpeed})</Label>
                <Input id="voiceSpeed" type="number" step="0.05" min="0.5" max="2.0" value={formData.voiceSpeed} onChange={(e) => setFormData({ ...formData, voiceSpeed: parseFloat(e.target.value) || 1.0 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="voiceStability">Kararlılık ({formData.voiceStability})</Label>
                <Input id="voiceStability" type="number" step="0.05" min="0" max="1" value={formData.voiceStability} onChange={(e) => setFormData({ ...formData, voiceStability: parseFloat(e.target.value) || 0.5 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="voiceSimilarityBoost">Benzerlik ({formData.voiceSimilarityBoost})</Label>
                <Input id="voiceSimilarityBoost" type="number" step="0.05" min="0" max="1" value={formData.voiceSimilarityBoost} onChange={(e) => setFormData({ ...formData, voiceSimilarityBoost: parseFloat(e.target.value) || 0.75 })} />
              </div>
            </div>
          </div>

          {/* End Call Tool */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tool Ayarları</h4>
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="endCallToolEnabled" className="cursor-pointer">End Call Tool</Label>
                  <p className="text-[10px] text-muted-foreground">
                    AI&apos;a konuşmayı sonlandırma yetkisi verir
                  </p>
                </div>
                <input
                  id="endCallToolEnabled"
                  type="checkbox"
                  checked={formData.endCallToolEnabled}
                  onChange={(e) => setFormData({ ...formData, endCallToolEnabled: e.target.checked })}
                  className="h-5 w-5 cursor-pointer"
                />
              </div>
              {formData.endCallToolEnabled && (
                <div className="rounded bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300 dark:border-yellow-800 p-2 text-xs text-yellow-900 dark:text-yellow-200">
                  <strong>⚠️ Uyarı:</strong> Sistem prompt&apos;ında <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">end_call_tool</code>, <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">endCall</code> gibi kelimeler ASLA olmasın. Zayıf modeller (gpt-oss-20b vb.) tool&apos;u erken çağırır. Gerekirse tool&apos;u kapalı bırak.
                </div>
              )}
            </div>
          </div>

          {/* Stop Speaking Plan */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Konuşma Kesme Planı</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="stopSpeakingNumWords">Kelime Sayısı</Label>
                <Input id="stopSpeakingNumWords" type="number" min="1" max="10" value={formData.stopSpeakingNumWords} onChange={(e) => setFormData({ ...formData, stopSpeakingNumWords: parseInt(e.target.value) || 3 })} />
                <p className="text-[10px] text-muted-foreground">Kaç kelime sonra kessin</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stopSpeakingVoiceSeconds">Ses Süresi (sn)</Label>
                <Input id="stopSpeakingVoiceSeconds" type="number" step="0.1" min="0" max="2" value={formData.stopSpeakingVoiceSeconds} onChange={(e) => setFormData({ ...formData, stopSpeakingVoiceSeconds: parseFloat(e.target.value) || 0.2 })} />
                <p className="text-[10px] text-muted-foreground">Ses algılama süresi</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stopSpeakingBackoffSeconds">Geri Çekilme (sn)</Label>
                <Input id="stopSpeakingBackoffSeconds" type="number" step="0.1" min="0" max="5" value={formData.stopSpeakingBackoffSeconds} onChange={(e) => setFormData({ ...formData, stopSpeakingBackoffSeconds: parseFloat(e.target.value) || 0 })} />
                <p className="text-[10px] text-muted-foreground">Kesme sonrası bekleme</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>İptal</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Kaydediliyor...' : 'Kaydet'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteAssistant({ id, onSuccess }: { id: string; onSuccess: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/assistant?id=${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        toast.success(`Asistan silindi (${data.vapiDeleted || 0} hattan temizlendi)`)
        router.refresh()
        onSuccess()
      } else {
        toast.error('Silme başarısız')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Asistan silinecek</AlertDialogTitle>
          <AlertDialogDescription>
            Bu asistan veritaban\u0131ndan ve t\u00FCm arama hatlar\u0131ndaki kopyalar\u0131ndan kal\u0131c\u0131 olarak silinecek.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>İptal</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={loading}>
            {loading ? 'Siliniyor...' : 'Sil'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// SIP Management
interface SipFormProps {
  userId: string
  sip?: any
  onSuccess: () => void
}

export function SipForm({ userId, sip, onSuccess }: SipFormProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const getInitialData = () => ({
    name: sip?.name || '',
    ipAddress: sip?.ip_address || '',
    port: sip?.port || '',
    username: sip?.username || '',
    password: sip?.password || '',
    phoneNumber: sip?.phone_number || '',
  })

  const [formData, setFormData] = useState(getInitialData)

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setFormData(getInitialData())
    }
    setOpen(isOpen)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const url = '/api/admin/sip'
      const method = sip ? 'PUT' : 'POST'
      const body = sip
        ? { id: sip.id, ...formData }
        : { userId, ...formData }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await response.json().catch(() => ({}))

      if (response.ok) {
        if (data.warning) {
          toast.warning(data.warning)
        } else if (data.provisioning) {
          toast.success(
            `SIP kaydedildi (${data.provisioning.successful}/${data.provisioning.total} key'e provision edildi)`
          )
        } else {
          toast.success(sip ? 'SIP güncellendi' : 'SIP oluşturuldu')
        }
        setOpen(false)
        router.refresh()
        onSuccess()
      } else {
        toast.error(data.error || 'İşlem başarısız')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {sip ? (
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Yeni SIP
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sip ? 'SIP Düzenle' : 'Yeni SIP'}</DialogTitle>
          <DialogDescription>
            SIP bilgilerini girin
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">İsim</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ipAddress">IP Adresi</Label>
            <Input
              id="ipAddress"
              value={formData.ipAddress}
              onChange={(e) => setFormData({ ...formData, ipAddress: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input
              id="port"
              type="number"
              value={formData.port}
              onChange={(e) => setFormData({ ...formData, port: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Kullanıcı Adı</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Şifre</Label>
            <Input
              id="password"
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">Telefon Numarası (E.164)</Label>
            <Input
              id="phoneNumber"
              value={formData.phoneNumber}
              onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
              placeholder="+903129552013"
            />
            <p className="text-[10px] text-muted-foreground">Boş bırakılırsa +90 + kullanıcı adı kullanılır</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Kaydediliyor...' : 'Kaydet'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteSip({ id, onSuccess }: { id: string; onSuccess: () => void }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleDelete = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/sip?id=${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        const data = await response.json().catch(() => ({}))
        toast.success(`SIP silindi (${data.vapiDeleted || 0} hattan temizlendi)`)
        router.refresh()
        onSuccess()
      } else {
        toast.error('Silme başarısız')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>SIP silinecek</AlertDialogTitle>
          <AlertDialogDescription>
            Bu SIP veritaban\u0131ndan ve t\u00FCm arama hatlar\u0131ndaki kay\u0131tlardan kal\u0131c\u0131 olarak silinecek.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>İptal</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={loading}>
            {loading ? 'Siliniyor...' : 'Sil'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}