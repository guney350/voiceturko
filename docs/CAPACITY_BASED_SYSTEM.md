# 🚀 Kapasite Tabanlı VAPI Sistemi

## 📋 Sistem Özeti

**Önemli Değişiklik:** Sistem artık **bakiye tabanlı değil, kapasite tabanlı** çalışıyor.

### Temel Kural
```
Her VAPI Hesabı = 10 Eşzamanlı Arama Kapasitesi
```

---

## 🔄 Eski Sistem vs Yeni Sistem

### ❌ Eski Sistem (Bakiye Tabanlı)
```
- Her hesabın bakiyesi vardı ($10, $50, vb.)
- Her arama maliyeti bakiyeden düşülürdü
- Bakiye bitince hesap değişirdi
- Karmaşık maliyet hesaplamaları
```

### ✅ Yeni Sistem (Kapasite Tabanlı)
```
- Her hesap = 10 eşzamanlı arama
- Bakiye yok, sadece kapasite
- Kapasite dolunca hesap değişir
- Basit ve hızlı
```

---

## 📊 Kapasite Yönetimi

### Hesap Kapasitesi

```typescript
interface VapiAccount {
  max_concurrent_calls: 10      // Sabit: Her hesap 10 arama
  current_active_calls: 0-10     // Anlık kullanım
  status: 'active' | 'standby' | 'capacity_full' | 'error'
}
```

### Kapasite Durumları

| Durum | Açıklama | Kullanılabilir mi? |
|-------|----------|-------------------|
| `active` | Aktif hesap, kapasite var | ✅ Evet |
| `standby` | Beklemede, kapasite var | ✅ Evet |
| `capacity_full` | Kapasite dolu (10/10) | ❌ Hayır |
| `error` | Hata durumu | ❌ Hayır |

---

## 🔄 Otomatik Hesap Değiştirme

### Akış

```
1. Arama başlatılacak
   ↓
2. Mevcut hesabın kapasitesi kontrol edilir
   ↓
3. Kapasite var mı?
   ├─ EVET → Arama başlar
   │         current_active_calls++
   │
   └─ HAYIR → Sıradaki hesaba geç
             ├─ Asistanları kopyala
             └─ Yeni hesapla devam et
```

### Kod Örneği

```typescript
// Otomatik hesap seçimi
const account = await VapiAccountManager.getAvailableAccount(userId)

// Kapasite artır
await VapiAccountManager.incrementActiveCall(account.id)

// Arama yap...

// Arama bittiğinde (webhook'tan)
await VapiAccountManager.decrementActiveCall(account.id)
```

---

## 📈 Ölçeklendirme

### Kapasite Hesaplama

```
Toplam Kapasite = Hesap Sayısı × 10

Örnekler:
- 1 hesap  = 10 eşzamanlı arama
- 5 hesap  = 50 eşzamanlı arama
- 10 hesap = 100 eşzamanlı arama
- 20 hesap = 200 eşzamanlı arama
```

### Kullanım Örneği

```typescript
// İstatistikleri al
const stats = await VapiAccountManager.getStats(userId)

console.log(stats)
// {
//   totalAccounts: 10,
//   activeAccounts: 10,
//   totalCapacity: 100,      // 10 hesap × 10
//   usedCapacity: 45,        // Şu anda 45 arama aktif
//   availableCapacity: 55,   // 55 slot boş
//   currentAccount: {...}
// }
```

---

## 🔌 API Değişiklikleri

### 1. Hesap Ekleme (Bakiye YOK)

**Eski:**
```typescript
await VapiAccountManager.addAccount(userId, email, apiKey, balance: 50)
```

**Yeni:**
```typescript
await VapiAccountManager.addAccount(userId, email, apiKey)
// Otomatik 10 arama kapasitesi
```

### 2. Toplu Hesap Yükleme

**Eski:**
```typescript
accounts: [
  { email, apiKey, balance: 50 }
]
```

**Yeni:**
```typescript
accounts: [
  { email, apiKey }  // Bakiye yok
]
```

### 3. İstatistikler

**Eski:**
```typescript
{
  totalBalance: 500,
  currentBalance: 250
}
```

**Yeni:**
```typescript
{
  totalCapacity: 100,
  usedCapacity: 45,
  availableCapacity: 55
}
```

---

## 🗄️ Database Değişiklikleri

### Kaldırılan Alanlar

```sql
-- vapi_accounts tablosundan
❌ initial_balance
❌ current_balance
❌ min_balance_threshold
❌ total_spent

-- vapi_balance_logs tablosu
❌ Tüm tablo (artık kullanılmıyor)
```

### Eklenen Alanlar

```sql
-- vapi_accounts
✅ max_concurrent_calls INTEGER DEFAULT 10
✅ current_active_calls INTEGER DEFAULT 0

-- campaign_items
✅ vapi_account_id UUID (hangi hesapla arandı)

-- vapi_account_switch_logs
✅ from_active_calls INTEGER
✅ to_active_calls INTEGER
```

---

## 🔄 Kampanya İşleme

### Arama Başlatma

```typescript
// 1. Kullanılabilir hesap al (otomatik değişim)
const account = await VapiAccountManager.getAvailableAccount(userId)

// 2. Kapasite artır
await VapiAccountManager.incrementActiveCall(account.id)

// 3. VAPI API çağrısı
const response = await fetch('https://api.vapi.ai/call', {
  headers: { 'Authorization': `Bearer ${account.api_key}` },
  body: JSON.stringify({
    assistantId,
    phoneNumberId,
    customer: { number, name }
  })
})

// 4. Başarısızsa kapasiteyi geri ver
if (!response.ok) {
  await VapiAccountManager.decrementActiveCall(account.id)
}
```

### Webhook İşleme

```typescript
// Arama tamamlandı
async function handleCallCompleted(payload) {
  // 1. Item'ı completed yap
  await updateItem(itemId, { status: 'completed' })
  
  // 2. Kapasiteyi serbest bırak
  await VapiAccountManager.decrementActiveCall(accountId)
  
  // 3. Sıradaki aramayı başlat
  await CampaignProcessor.tick(campaignId, userId)
}
```

---

## 📊 Monitoring

### Kapasite İzleme

```sql
-- Toplam kapasite kullanımı
SELECT 
  COUNT(*) as total_accounts,
  SUM(max_concurrent_calls) as total_capacity,
  SUM(current_active_calls) as used_capacity,
  SUM(max_concurrent_calls - current_active_calls) as available_capacity
FROM vapi_accounts
WHERE is_active = true;

-- Hesap bazında kullanım
SELECT 
  email,
  current_active_calls,
  max_concurrent_calls,
  ROUND(current_active_calls::numeric / max_concurrent_calls * 100, 2) as usage_percent
FROM vapi_accounts
WHERE is_active = true
ORDER BY usage_percent DESC;
```

### Hesap Değişim Logları

```sql
-- Son hesap değişimleri
SELECT 
  created_at,
  switch_reason,
  from_active_calls,
  to_active_calls
FROM vapi_account_switch_logs
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🚨 Sorun Giderme

### Problem: "Kullanılabilir hesap kalmadı"

**Sebep:** Tüm hesaplar kapasite dolu (10/10)

**Çözüm:**
1. Daha fazla VAPI hesabı ekle
2. Kampanya `max_concurrent_calls` değerini düşür
3. Bekleyen aramaları azalt

### Problem: Kapasite sayacı yanlış

**Çözüm:**
```sql
-- Tüm hesapların kapasite sayacını sıfırla
UPDATE vapi_accounts 
SET current_active_calls = 0;

-- Aktif aramaları say ve güncelle
UPDATE vapi_accounts a
SET current_active_calls = (
  SELECT COUNT(*) 
  FROM campaign_items 
  WHERE vapi_account_id = a.id 
  AND status = 'calling'
);
```

### Problem: Hesap otomatik değişmiyor

**Kontrol:**
```sql
-- Kullanılabilir hesap var mı?
SELECT * FROM vapi_accounts
WHERE is_active = true
AND status IN ('active', 'standby')
AND current_active_calls < max_concurrent_calls;
```

---

## 🎯 Best Practices

### 1. Hesap Sayısı

```
Hedef Kapasite ÷ 10 = Gerekli Hesap Sayısı

Örnek:
- 50 eşzamanlı arama → 5 hesap
- 100 eşzamanlı arama → 10 hesap
- 200 eşzamanlı arama → 20 hesap
```

### 2. Kampanya Ayarları

```typescript
// Kampanya başına max concurrent
max_concurrent_calls: 10  // Hesap başına kapasite

// Çok fazla kampanya varsa
// Her kampanya 10 arama × 5 kampanya = 50 arama
// Minimum 5 hesap gerekir
```

### 3. Monitoring

```typescript
// Düzenli kapasite kontrolü
setInterval(async () => {
  const stats = await VapiAccountManager.getStats(userId)
  
  if (stats.availableCapacity < 10) {
    console.warn('⚠️ Kapasite düşük! Yeni hesap ekle')
  }
}, 60000) // Her dakika
```

---

## 📝 Migration Rehberi

### Adım 1: Migration Çalıştır

```bash
# Supabase CLI
supabase db push

# Veya SQL Editor'de
# supabase/migrations/20240329000000_capacity_based_system.sql
```

### Adım 2: Mevcut Verileri Kontrol Et

```sql
-- Hesaplar temizlendi mi?
SELECT 
  email,
  max_concurrent_calls,
  current_active_calls,
  status
FROM vapi_accounts;

-- Tüm hesaplar 0/10 olmalı
```

### Adım 3: İlk Hesabı Aktif Et

```sql
-- İlk hesabı aktif yap
UPDATE vapi_accounts 
SET is_current = true,
    status = 'active'
WHERE id = (
  SELECT id FROM vapi_accounts 
  WHERE is_active = true 
  ORDER BY created_at ASC 
  LIMIT 1
);
```

### Adım 4: Test Et

```typescript
// Test kampanyası oluştur
const campaign = await createCampaign({
  name: 'Test Kampanya',
  items: 5  // 5 kişi
})

// Başlat
await startCampaign(campaign.id)

// Kapasite kontrolü
const stats = await VapiAccountManager.getStats(userId)
console.log(stats.usedCapacity) // 5 olmalı
```

---

## 🎉 Avantajlar

### 1. Basitlik
- ❌ Karmaşık maliyet hesaplamaları yok
- ✅ Sadece kapasite sayacı

### 2. Hız
- ❌ Bakiye kontrolü ve güncelleme yok
- ✅ Sadece increment/decrement

### 3. Ölçeklenebilirlik
- ❌ Bakiye bitince manuel müdahale
- ✅ Otomatik hesap değiştirme

### 4. Öngörülebilirlik
- ❌ Bakiye ne zaman biter belirsiz
- ✅ Her hesap = 10 arama (sabit)

---

## 📞 Destek

Sorularınız için:
- GitHub Issues
- Dokümantasyon: `/docs`

---

**Son Güncelleme:** 2024-03-29  
**Versiyon:** 2.0.0 (Capacity-Based)