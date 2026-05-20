'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Settings, Database, Bot } from 'lucide-react'
import { toast } from 'sonner'

export default function AdminSettingsPage() {
  const [adminEndpoint, setAdminEndpoint] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [defaultSettings, setDefaultSettings] = useState({
    ai_provider: 'openai',
    ai_model: '',
    elevenlabs_voice_id: '',
    elevenlabs_model: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setAdminEndpoint(process.env.NEXT_PUBLIC_ADMIN_ENDPOINT || 'admin')
    loadDefaultSettings()
  }, [])

  const loadDefaultSettings = async () => {
    try {
      const response = await fetch('/api/admin/default-settings')
      if (response.ok) {
        const data = await response.json()
        setDefaultSettings({
          ai_provider: data.ai_provider || 'openai',
          ai_model: data.ai_model || '',
          elevenlabs_voice_id: data.elevenlabs_voice_id || '',
          elevenlabs_model: data.elevenlabs_model || ''
        })
      }
    } catch (error) {
      console.error('Error loading default settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveDefaultSettings = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/default-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiProvider: defaultSettings.ai_provider,
          aiModel: defaultSettings.ai_model,
          elevenlabsVoiceId: defaultSettings.elevenlabs_voice_id,
          elevenlabsModel: defaultSettings.elevenlabs_model
        })
      })

      if (response.ok) {
        toast.success('Default asistan ayarları güncellendi')
      } else {
        toast.error('Güncelleme başarısız')
      }
    } catch (error) {
      toast.error('Bir hata oluştu')
    } finally {
      setSaving(false)
    }
  }

  const handleComingSoon = (feature: string) => {
    toast.info(`${feature} özelliği henüz aktif değil`)
  }

  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Admin Ayarları</h1>
          <p className="text-muted-foreground">Sistem ayarlarını yönet</p>
        </div>
      </div>

      <div className="@container/main px-4 lg:px-6 space-y-6">
        <div className="grid gap-4">
        {/* Default Asistan Ayarları */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <CardTitle>Default Asistan Ayarları</CardTitle>
            </div>
            <CardDescription>Yeni asistanlar için varsayılan ayarlar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Yükleniyor...</p>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="ai_provider">AI Provider</Label>
                  <Select
                    value={defaultSettings.ai_provider}
                    onValueChange={(value) => setDefaultSettings({ ...defaultSettings, ai_provider: value })}
                  >
                    <SelectTrigger id="ai_provider">
                      <SelectValue />
                    </SelectTrigger>
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
                  <p className="text-xs text-muted-foreground">
                    Kullanılacak AI sağlayıcısı
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ai_model">AI Model</Label>
                  <Input
                    id="ai_model"
                    value={defaultSettings.ai_model}
                    onChange={(e) => setDefaultSettings({ ...defaultSettings, ai_model: e.target.value })}
                    placeholder="gpt-4o"
                  />
                  <p className="text-xs text-muted-foreground">
                    Kullanılacak AI model (örn: gpt-4o, gpt-4-turbo)
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="elevenlabs_voice_id">ElevenLabs Voice ID</Label>
                  <Input
                    id="elevenlabs_voice_id"
                    value={defaultSettings.elevenlabs_voice_id}
                    onChange={(e) => setDefaultSettings({ ...defaultSettings, elevenlabs_voice_id: e.target.value })}
                    placeholder="pNInz6obpgDQGcFmaJgB"
                  />
                  <p className="text-xs text-muted-foreground">
                    ElevenLabs ses ID'si
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="elevenlabs_model">ElevenLabs Model</Label>
                  <Input
                    id="elevenlabs_model"
                    value={defaultSettings.elevenlabs_model}
                    onChange={(e) => setDefaultSettings({ ...defaultSettings, elevenlabs_model: e.target.value })}
                    placeholder="eleven_turbo_v2_5"
                  />
                  <p className="text-xs text-muted-foreground">
                    ElevenLabs model versiyonu
                  </p>
                </div>

                <Button onClick={handleSaveDefaultSettings} disabled={saving}>
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Genel Ayarlar */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              <CardTitle>Genel Ayarlar</CardTitle>
            </div>
            <CardDescription>Admin panel yapılandırması</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="endpoint">Admin Endpoint</Label>
              <Input
                id="endpoint"
                value={adminEndpoint}
                onChange={(e) => setAdminEndpoint(e.target.value)}
                placeholder="admin"
                disabled
              />
              <p className="text-xs text-muted-foreground">
                .env dosyasındaki ADMIN_ENDPOINT değeri
              </p>
            </div>

            <Separator />

            <div className="grid gap-2">
              <Label htmlFor="password">Yeni Admin Şifresi</Label>
              <Input
                id="password"
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Yeni şifre"
              />
              <p className="text-xs text-muted-foreground">
                .env dosyasındaki ADMIN_PASSWORD değerini değiştirin
              </p>
            </div>

            <Button onClick={() => handleComingSoon('Şifre değiştirme')} disabled>
              Şifre Değiştir (Yakında)
            </Button>
          </CardContent>
        </Card>

        {/* Sistem Bakımı */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <CardTitle>Sistem Bakımı</CardTitle>
            </div>
            <CardDescription>Veritabanı ve cache yönetimi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Cache Temizle</p>
                <p className="text-sm text-muted-foreground">
                  Tüm cache verilerini temizle
                </p>
              </div>
              <Button variant="outline" onClick={() => handleComingSoon('Cache temizleme')} disabled>
                Yakında
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Veritabanı Yedekle</p>
                <p className="text-sm text-muted-foreground">
                  Veritabanının tam yedeğini al
                </p>
              </div>
              <Button variant="outline" onClick={() => handleComingSoon('Veritabanı yedekleme')} disabled>
                Yakında
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Log Temizle</p>
                <p className="text-sm text-muted-foreground">
                  30 günden eski audit logları sil
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => handleComingSoon('Log temizleme')}
                disabled
              >
                Yakında
              </Button>
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </>
  )
}