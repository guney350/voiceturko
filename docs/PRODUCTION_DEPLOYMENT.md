# 🚀 Production Deployment Rehberi

## ✅ Production Hazırlık Kontrol Listesi

### 1. Database Migration'ları

```bash
# Supabase CLI ile migration'ları uygula
supabase db push

# Veya Supabase Dashboard'dan SQL Editor'de çalıştır:
# - supabase/migrations/20240318000000_vapi_complete_system.sql
# - supabase/migrations/20240318000001_assistant_account_mapping.sql
```

### 2. Environment Variables

`.env.local` dosyasını oluştur ve doldur:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Cron Secret (rastgele güçlü bir string)
CRON_SECRET=your_random_secret_string

# App URL
NEXT_PUBLIC_APP_URL=https://yourdomain.com

# Admin Endpoint
ADMIN_ENDPOINT=admin
```

### 3. Supabase RLS Policies

Database'de Row Level Security (RLS) politikalarını aktif et:

```sql
-- Kullanıcılar sadece kendi verilerini görsün
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vapi_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vapi_assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE vapi_phone_numbers ENABLE ROW LEVEL SECURITY;

-- Örnek policy (her tablo için benzer şekilde)
CREATE POLICY "Users can view own campaigns"
  ON campaigns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

### 4. Vercel/Netlify Deployment

#### Vercel
```bash
# Vercel CLI ile deploy
npm install -g vercel
vercel --prod

# Environment variables'ı Vercel Dashboard'dan ekle
```

#### Cron Job Ayarları (Vercel)
`vercel.json` oluştur:

```json
{
  "crons": [
    {
      "path": "/api/cron/campaign-watchdog",
      "schedule": "* * * * *"
    }
  ]
}
```

### 5. VAPI Webhook Ayarları

VAPI Dashboard'da webhook URL'ini ayarla:
```
https://yourdomain.com/api/webhooks/vapi
```

Events:
- ✅ call.ended
- ✅ call.completed
- ✅ call.failed

### 6. İlk Kurulum Adımları

#### 6.1. Admin Kullanıcı Oluştur
```sql
-- Supabase SQL Editor'de
INSERT INTO users (id, email, role)
VALUES (
  'your-user-id-from-auth',
  'admin@yourdomain.com',
  'admin'
);
```

#### 6.2. VAPI Hesapları Ekle
Admin panelinden:
1. `/admin/vapi-accounts` sayfasına git
2. "Toplu Yükle" butonuna tıkla
3. JSON formatında hesapları yükle:

```json
[
  {
    "email": "account1@example.com",
    "apiKey": "vapi_key_1",
    "balance": 10.00
  },
  {
    "email": "account2@example.com",
    "apiKey": "vapi_key_2",
    "balance": 10.00
  }
]
```

#### 6.3. Asistanları Senkronize Et
```bash
# API endpoint'ini çağır
curl -X POST https://yourdomain.com/api/vapi/assistants/sync \
  -H "Authorization: Bearer YOUR_USER_TOKEN"
```

#### 6.4. Telefon Numaralarını Senkronize Et
```bash
curl -X POST https://yourdomain.com/api/vapi/phone-numbers/sync \
  -H "Authorization: Bearer YOUR_USER_TOKEN"
```

### 7. Test Kampanyası

1. Dashboard'a git: `/dashboard/campaigns`
2. "Yeni Kampanya" butonuna tıkla
3. Test CSV'si yükle (2-3 müşteri)
4. Kampanyayı başlat
5. Logları izle

## 🔍 Production Kontrol Listesi

### Kritik Kontroller

- [ ] ✅ Database migration'ları uygulandı
- [ ] ✅ Environment variables ayarlandı
- [ ] ✅ RLS policies aktif
- [ ] ✅ Cron job çalışıyor (her dakika)
- [ ] ✅ VAPI webhook ayarlandı
- [ ] ✅ En az 2 VAPI hesabı eklendi
- [ ] ✅ Asistanlar senkronize edildi
- [ ] ✅ Telefon numaraları senkronize edildi
- [ ] ✅ Test kampanyası başarılı

### Güvenlik Kontrolleri

- [ ] ✅ API key'ler environment variables'da
- [ ] ✅ CRON_SECRET güçlü ve rastgele
- [ ] ✅ Supabase service role key güvenli
- [ ] ✅ Admin endpoint özelleştirildi
- [ ] ✅ RLS policies tüm tablolarda aktif

### Performans Kontrolleri

- [ ] ✅ Database index'ler oluşturuldu
- [ ] ✅ Connection pooling aktif
- [ ] ✅ Caching stratejisi belirlendi
- [ ] ✅ Rate limiting ayarlandı

## 🐛 Sorun Giderme

### Kampanya Başlamıyor

**Kontrol Et:**
1. Cron job çalışıyor mu? → `/api/cron/campaign-watchdog` endpoint'ini manuel çağır
2. VAPI hesabı aktif mi? → Admin panelinden kontrol et
3. Asistan mapping'i var mı? → `assistant_account_mapping` tablosunu kontrol et

**Çözüm:**
```bash
# Manuel tick çağır
curl -X POST https://yourdomain.com/api/campaigns/[campaign-id]/tick
```

### Hesap Değişmiyor

**Kontrol Et:**
1. Bakiye 0'a düştü mü? → `vapi_accounts` tablosunu kontrol et
2. Başka hesap var mı? → `status IN ('active', 'standby')` kontrol et

**Çözüm:**
```sql
-- Manuel hesap değiştir
UPDATE vapi_accounts SET is_current = false WHERE user_id = 'user-id';
UPDATE vapi_accounts SET is_current = true, status = 'active' 
WHERE id = 'new-account-id';
```

### Asistanlar Kopyalanmıyor

**Kontrol Et:**
1. VAPI API key geçerli mi?
2. Asistan tablosunda kayıt var mı?

**Çözüm:**
```bash
# Manuel asistan senkronizasyonu
curl -X POST https://yourdomain.com/api/vapi/assistants/sync
```

### Webhook Çalışmıyor

**Kontrol Et:**
1. VAPI Dashboard'da webhook URL doğru mu?
2. Webhook secret ayarlandı mı?

**Çözüm:**
- VAPI Dashboard → Settings → Webhooks
- URL: `https://yourdomain.com/api/webhooks/vapi`
- Events: call.ended, call.completed, call.failed

## 📊 Monitoring

### Önemli Metrikler

1. **Active Campaigns**: Kaç kampanya çalışıyor?
2. **Active Calls**: Kaç arama devam ediyor?
3. **Account Balance**: Toplam bakiye ne kadar?
4. **Success Rate**: Başarı oranı nedir?

### Log Kontrolleri

```bash
# Vercel logs
vercel logs --follow

# Supabase logs
# Dashboard → Logs → API Logs
```

### Database Queries

```sql
-- Aktif kampanyalar
SELECT * FROM campaigns WHERE status = 'running';

-- Aktif aramalar
SELECT COUNT(*) FROM campaign_items WHERE status = 'calling';

-- Hesap durumları
SELECT email, status, current_balance, is_current 
FROM vapi_accounts 
ORDER BY is_current DESC, priority ASC;

-- Son 10 log
SELECT * FROM campaign_logs 
ORDER BY created_at DESC 
LIMIT 10;
```

## 🎯 Performans Optimizasyonu

### Database Optimizasyonu

```sql
-- Eski logları temizle (30 günden eski)
DELETE FROM campaign_logs 
WHERE created_at < NOW() - INTERVAL '30 days';

DELETE FROM vapi_balance_logs 
WHERE checked_at < NOW() - INTERVAL '30 days';

-- Vacuum analyze
VACUUM ANALYZE campaigns;
VACUUM ANALYZE campaign_items;
```

### Caching Stratejisi

```typescript
// Redis ile aktif hesap cache'le
const cachedAccount = await redis.get(`vapi:account:${userId}`);
if (cachedAccount) return JSON.parse(cachedAccount);

const account = await VapiAccountManager.getCurrentAccount(userId);
await redis.setex(`vapi:account:${userId}`, 300, JSON.stringify(account));
```

## 🔄 Backup Stratejisi

### Otomatik Backup (Supabase)

Supabase Dashboard → Settings → Backups
- Daily backups: Aktif
- Point-in-time recovery: Aktif

### Manuel Backup

```bash
# Database dump
pg_dump -h db.your-project.supabase.co \
  -U postgres \
  -d postgres \
  -f backup_$(date +%Y%m%d).sql
```

## 📈 Scaling Stratejisi

### 100+ Eşzamanlı Arama İçin

1. **Çoklu VAPI Hesabı**: 10 hesap × 10 arama = 100 paralel
2. **Database Connection Pool**: Artır (default: 15 → 50)
3. **Vercel Serverless**: Otomatik scale eder
4. **Supabase**: Pro plan (daha fazla connection)

### 1000+ Eşzamanlı Arama İçin

1. **Redis Queue**: Bull/BullMQ ile queue sistemi
2. **Dedicated Workers**: Ayrı worker instance'ları
3. **Database Sharding**: Büyük tablolar için
4. **CDN**: Static asset'ler için

## 🎉 Production'a Hazır!

Tüm kontroller tamamlandıysa sistem production'a hazır. İyi aramalar! 🚀