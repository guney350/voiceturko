'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Bu sayfa kaldırıldı - SIP ekleme artık kullanıcı bazlı yapılıyor.
 * Admin Panel → Kullanıcılar → Kullanıcı Detay → SIP sekmesi
 */
export default function DeprecatedAddSipPage() {
  const router = useRouter()

  useEffect(() => {
    const adminEndpoint = process.env.NEXT_PUBLIC_ADMIN_ENDPOINT || 'admin'
    router.replace(`/${adminEndpoint}/users`)
  }, [router])

  return (
    <div className="container mx-auto p-6">
      <p className="text-muted-foreground">
        SIP ekleme artık kullanıcı detay sayfasından yapılır. Yönlendiriliyorsunuz...
      </p>
    </div>
  )
}
