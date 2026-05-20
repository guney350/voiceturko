# VoiceTurko Portal

AI destekli sesli çağrı analiz platformu. Supabase, Next.js 15, TypeScript ve Stripe ile geliştirilmiştir.

## Özellikler

- 🔐 **Kimlik Doğrulama**: Email ve Google OAuth ile giriş
- 📊 **Dashboard**: Gerçek zamanlı istatistikler ve kullanım takibi
- 💳 **Abonelik Yönetimi**: Stripe entegrasyonu ile esnek plan seçenekleri
- ⏱️ **Ek Dakika Sistemi**: Kullanıcılar istedikleri kadar ek dakika satın alabilir
- 📞 **Çağrı Yönetimi**: Ses kayıtları, transkript ve AI analizi
- 🤖 **Özelleştirilebilir Asistan**: Kişiselleştirilebilir AI asistan ayarları
- 📱 **SIP Entegrasyonu**: Telefon sistemi bağlantıları
- 🌙 **Dark Mode**: Varsayılan koyu tema

## Teknolojiler

- **Framework**: Next.js 15 (App Router)
- **Dil**: TypeScript
- **Veritabanı**: Supabase (PostgreSQL)
- **Kimlik Doğrulama**: Supabase Auth
- **Ödeme**: Stripe
- **UI**: shadcn/ui + Tailwind CSS
- **İkonlar**: Lucide React

## Kurulum

### Gereksinimler

- Node.js 18+
- npm veya yarn
- Supabase hesabı
- Stripe hesabı

### Adımlar

1. Repoyu klonlayın:
```bash
git clone <repo-url>
cd voiceturkoportal
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. `.env.local` dosyasını oluşturun:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. Supabase veritabanını kurun:
   - Supabase Dashboard'a gidin
   - SQL Editor'ü açın
   - `schema.sql` dosyasının içeriğini çalıştırın

5. Geliştirme sunucusunu başlatın:
```bash
npm run dev
```

6. Tarayıcıda açın: http://localhost:3000

## Veritabanı Şeması

Proje şu tabloları içerir:

- `plans` - Abonelik planları
- `subscriptions` - Kullanıcı abonelikleri
- `calls` - Çağrı kayıtları
- `usages` - Kullanım takibi
- `assistant` - Asistan ayarları
- `sips` - SIP sunucu yapılandırmaları
- `minute_pricing` - Dakika fiyatlandırması
- `minute_purchases` - Ek dakika alımları
- `invoices` - Fatura kayıtları
- `api_keys` - API anahtarları
- `audit_logs` - Sistem logları

## Stripe Webhook Kurulumu

1. Stripe Dashboard → Developers → Webhooks
2. "Add endpoint" butonuna tıklayın
3. Endpoint URL: `https://yourdomain.com/api/stripe/webhook`
4. Dinlenecek eventler:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Webhook secret'ı `.env.local` dosyasına ekleyin

## Proje Yapısı

```
voiceturkoportal/
├── app/
│   ├── (auth)/              # Auth sayfaları (login, register)
│   ├── (dashboard)/         # Dashboard sayfaları
│   ├── api/                 # API routes
│   │   └── stripe/          # Stripe endpoints
│   ├── auth/                # Auth callback
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Ana sayfa
├── components/
│   ├── dashboard/           # Dashboard componentleri
│   └── ui/                  # shadcn/ui componentleri
├── lib/
│   ├── supabase/            # Supabase client yapılandırması
│   ├── types/               # TypeScript tipleri
│   └── utils.ts             # Yardımcı fonksiyonlar
├── public/                  # Statik dosyalar
├── .env.local               # Ortam değişkenleri
├── middleware.ts            # Next.js middleware
├── schema.sql               # Veritabanı şeması
└── package.json
```

## Deployment

### Vercel

1. Vercel'e projeyi import edin
2. Environment variables'ı ekleyin
3. Deploy edin
4. Stripe webhook URL'ini güncelleyin

### Diğer Platformlar

Next.js'in desteklediği herhangi bir platformda deploy edilebilir.

## Lisans

MIT

## Destek

Sorularınız için: support@voiceturko.com