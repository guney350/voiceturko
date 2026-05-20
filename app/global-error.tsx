'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html lang="tr">
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              Kritik Hata
            </h1>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>
              Sistemde beklenmedik bir hata oluştu. Lütfen sayfayı yeniden yükleyin.
            </p>
            <button
              onClick={reset}
              style={{
                padding: '0.5rem 1.5rem',
                background: '#000',
                color: '#fff',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
            >
              Tekrar Dene
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
