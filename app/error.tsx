'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, RotateCw, Home } from 'lucide-react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-destructive/10 p-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold">Bir hata oluştu</h1>
          <p className="text-muted-foreground mt-2">
            Beklenmedik bir sorunla karşılaştık. Lütfen tekrar deneyin.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground mt-2 font-mono">
              Hata kodu: {error.digest}
            </p>
          )}
        </div>
        <div className="flex gap-2 justify-center">
          <Button onClick={reset} variant="default">
            <RotateCw className="h-4 w-4 mr-2" />
            Tekrar Dene
          </Button>
          <Link href="/dashboard">
            <Button variant="outline">
              <Home className="h-4 w-4 mr-2" />
              Anasayfa
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
