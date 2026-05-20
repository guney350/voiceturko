import { NextResponse } from 'next/server'

export async function GET() {
  const sampleCsv = `İsim,Cinsiyet,Telefon Numarası
Ahmet Yılmaz,Erkek,05551234567
Ayşe Demir,Kadın,05559876543
Mehmet Kaya,,05551112233
Fatma Şahin,Kadın,05554445566
Ali Öztürk,Erkek,05557778899
Zeynep Aydın,Kadın,05553334455
Mustafa Çelik,Erkek,05556667788
Elif Yıldız,Kadın,05552223344
Hasan Arslan,Erkek,05558889900
Merve Koç,Kadın,05551119922`

  return new NextResponse(sampleCsv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ornek-kampanya.csv"',
    },
  })
}