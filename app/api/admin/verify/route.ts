import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json()
    const adminPassword = process.env.ADMIN_PASSWORD

    if (!adminPassword) {
      return NextResponse.json(
        { success: false, error: 'Admin password not configured' },
        { status: 500 }
      )
    }

    if (password === adminPassword) {
      // Cookie'ye admin session kaydet
      const cookieStore = await cookies()
      cookieStore.set('admin_session', 'verified', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 24 saat
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { success: false, error: 'Geçersiz şifre' },
      { status: 401 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Sunucu hatası' },
      { status: 500 }
    )
  }
}