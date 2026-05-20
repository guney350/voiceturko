'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

/**
 * @deprecated — Bu sayfa artık kullanılmıyor.
 * Yeni sayfa: /{adminEndpoint}/pool
 */
export default function OldVapiAccountsPage() {
  const router = useRouter()
  const params = useParams()
  
  useEffect(() => {
    router.replace(`/${params.adminEndpoint}/pool`)
  }, [router, params.adminEndpoint])

  return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <p>API Key Havuzu sayfasına yönlendiriliyorsunuz...</p>
    </div>
  )
}