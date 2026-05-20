'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, CheckCircle, ArrowLeft, Zap } from 'lucide-react'
import { localizeError } from '@/lib/error-messages'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/settings`,
    })

    if (error) {
      setError(localizeError(error))
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <Zap className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">VoiceTurko Portal</h1>
          <p className="text-muted-foreground mt-2">Şifre Sıfırlama</p>
        </div>

        <Card className="border-2">
          {success ? (
            <CardContent className="pt-6 text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-3">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <h2 className="text-xl font-semibold">Email Gönderildi</h2>
              <p className="text-muted-foreground text-sm">
                <strong>{email}</strong> adresine şifre sıfırlama linki gönderildi.
                Email kutunuzu kontrol edin.
              </p>
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Girişe Dön
                </Button>
              </Link>
            </CardContent>
          ) : (
            <>
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-bold">Şifremi Unuttum</CardTitle>
                <CardDescription>
                  Email adresinizi girin, size şifre sıfırlama linki gönderelim
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleReset} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="ornek@email.com"
                        className="pl-10 h-11"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>
                  {error && (
                    <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      {error}
                    </div>
                  )}
                  <Button type="submit" className="w-full h-11" disabled={loading}>
                    {loading ? 'Gönderiliyor...' : 'Sıfırlama Linki Gönder'}
                  </Button>
                </form>
              </CardContent>
              <CardFooter>
                <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground hover:underline mx-auto">
                  ← Girişe geri dön
                </Link>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
