'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle2, Circle, ArrowRight, Sparkles, X } from 'lucide-react'
import Link from 'next/link'

interface Step {
  id: string
  label: string
  completed: boolean
  link: string | null
}

interface OnboardingData {
  steps: Step[]
  completed: number
  total: number
  progress: number
  isComplete: boolean
}

export function OnboardingChecklist() {
  const [data, setData] = useState<OnboardingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // localStorage'dan dismissed durumunu kontrol et
    const isDismissed = localStorage.getItem('onboarding-dismissed') === 'true'
    setDismissed(isDismissed)

    fetch('/api/user/onboarding')
      .then(r => r.json())
      .then(d => {
        if (d.success) setData(d)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleDismiss = () => {
    localStorage.setItem('onboarding-dismissed', 'true')
    setDismissed(true)
  }

  if (loading) return <Skeleton className="h-48" />
  if (!data) return null

  // Tamamlandıysa veya dismiss edildiyse gösterme
  if (data.isComplete && dismissed) return null

  // Tamamlandıysa kutlama göster (sadece bir kez)
  if (data.isComplete) {
    return (
      <Card className="border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/40">
        <CardContent className="p-6 relative">
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-green-500/10">
              <Sparkles className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Kurulum tamamlandı</h3>
              <p className="text-sm text-muted-foreground">
                Tüm adımları başarıyla geçtiniz. Artık tam kapasitede aramalar yapabilirsiniz.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-purple-500/5">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Başlangıç Rehberi
            </CardTitle>
            <CardDescription>
              Sistemden yararlanmaya başlamak için aşağıdaki adımları tamamlayın.
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">{data.progress}%</div>
            <div className="text-xs text-muted-foreground">{data.completed}/{data.total} tamamlandı</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-secondary overflow-hidden mt-2">
          <div
            className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all"
            style={{ width: `${data.progress}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.steps.map((step, i) => {
          const isCurrent = !step.completed && data.steps.slice(0, i).every(s => s.completed)
          return (
            <div
              key={step.id}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                step.completed
                  ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                  : isCurrent
                  ? 'bg-primary/5 border-primary/30 shadow-sm'
                  : 'bg-card border-border'
              }`}
            >
              <div className="flex items-center gap-3">
                {step.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                ) : (
                  <Circle className={`w-5 h-5 flex-shrink-0 ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`} />
                )}
                <div>
                  <p className={`text-sm font-medium ${step.completed ? 'text-green-800 dark:text-green-200 line-through' : ''}`}>
                    {step.label}
                  </p>
                  {isCurrent && (
                    <p className="text-xs text-muted-foreground mt-0.5">⬅ Sıradaki adım</p>
                  )}
                </div>
              </div>

              {!step.completed && step.link && (
                <Link href={step.link}>
                  <Button size="sm" variant={isCurrent ? 'default' : 'outline'}>
                    {isCurrent ? 'Şimdi Yap' : 'Git'}
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
