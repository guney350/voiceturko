-- =====================================================
-- CAPACITY-BASED SYSTEM MIGRATION
-- =====================================================
-- Bakiye sisteminden kapasite sistemine geçiş
-- Her VAPI hesabı = 10 eşzamanlı arama kapasitesi
-- =====================================================

-- =====================================================
-- 1. VAPI_ACCOUNTS Tablosu Güncelleme
-- =====================================================

-- Bakiye ile ilgili alanları kaldır
ALTER TABLE vapi_accounts 
  DROP COLUMN IF EXISTS initial_balance,
  DROP COLUMN IF EXISTS current_balance,
  DROP COLUMN IF EXISTS min_balance_threshold,
  DROP COLUMN IF EXISTS total_spent;

-- Kapasite alanlarını ekle
ALTER TABLE vapi_accounts
  ADD COLUMN IF NOT EXISTS max_concurrent_calls INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS current_active_calls INTEGER DEFAULT 0;

-- =====================================================
-- 1.5 CAMPAIGN_ITEMS Tablosu Güncelleme
-- =====================================================

-- Hangi hesapla arandığını takip etmek için
ALTER TABLE campaign_items
  ADD COLUMN IF NOT EXISTS vapi_account_id UUID REFERENCES vapi_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_items_account
  ON campaign_items(vapi_account_id);

-- Status enum'unu güncelle (exhausted → capacity_full)
-- Önce mevcut exhausted değerlerini capacity_full'a çevir
UPDATE vapi_accounts 
SET status = 'capacity_full' 
WHERE status = 'exhausted';

-- Status constraint'i güncelle
ALTER TABLE vapi_accounts 
  DROP CONSTRAINT IF EXISTS vapi_accounts_status_check;

ALTER TABLE vapi_accounts
  ADD CONSTRAINT vapi_accounts_status_check 
  CHECK (status IN ('active', 'standby', 'capacity_full', 'error'));

-- low_balance durumunu kaldır, active yap
UPDATE vapi_accounts 
SET status = 'active' 
WHERE status = 'low_balance';

-- Index'leri güncelle
CREATE INDEX IF NOT EXISTS idx_vapi_accounts_capacity 
  ON vapi_accounts(current_active_calls, max_concurrent_calls);

-- =====================================================
-- 2. VAPI_BALANCE_LOGS Tablosunu Kaldır
-- =====================================================

-- Bu tablo artık kullanılmayacak, ancak veri kaybını önlemek için
-- yedek tablo olarak yeniden adlandır
ALTER TABLE IF EXISTS vapi_balance_logs 
  RENAME TO vapi_balance_logs_archived;

-- RLS'i kapat
ALTER TABLE IF EXISTS vapi_balance_logs_archived 
  DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3. VAPI_ACCOUNT_SWITCH_LOGS Güncelleme
-- =====================================================

-- Bakiye alanlarını kaldır
ALTER TABLE vapi_account_switch_logs
  DROP COLUMN IF EXISTS from_balance,
  DROP COLUMN IF EXISTS to_balance;

-- Kapasite bilgisi ekle
ALTER TABLE vapi_account_switch_logs
  ADD COLUMN IF NOT EXISTS from_active_calls INTEGER,
  ADD COLUMN IF NOT EXISTS to_active_calls INTEGER;

-- switch_reason değerlerini güncelle
UPDATE vapi_account_switch_logs 
SET switch_reason = 'capacity_full' 
WHERE switch_reason = 'exhausted';

-- =====================================================
-- 4. SYSTEM_SETTINGS Güncelleme
-- =====================================================

-- Bakiye ile ilgili ayarları kaldır, kapasite ayarları ekle
DELETE FROM system_settings 
WHERE key IN ('default_phone_number_id', 'webhook_secret');

INSERT INTO system_settings (key, value, description) VALUES
  ('max_calls_per_account', '10', 'Her VAPI hesabının maksimum eşzamanlı arama kapasitesi'),
  ('auto_switch_on_capacity_full', 'true', 'Kapasite dolduğunda otomatik hesap değiştir')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;

-- =====================================================
-- 5. Yeni Fonksiyonlar
-- =====================================================

-- Hesabın kullanılabilir kapasitesini hesapla
CREATE OR REPLACE FUNCTION get_account_available_capacity(account_id UUID)
RETURNS INTEGER AS $$
DECLARE
  max_calls INTEGER;
  active_calls INTEGER;
BEGIN
  SELECT max_concurrent_calls, current_active_calls
  INTO max_calls, active_calls
  FROM vapi_accounts
  WHERE id = account_id;
  
  RETURN COALESCE(max_calls, 10) - COALESCE(active_calls, 0);
END;
$$ LANGUAGE plpgsql;

-- Kullanıcının toplam kapasitesini hesapla
CREATE OR REPLACE FUNCTION get_user_total_capacity(user_uuid UUID)
RETURNS TABLE(
  total_capacity INTEGER,
  used_capacity INTEGER,
  available_capacity INTEGER,
  active_accounts INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(max_concurrent_calls), 0)::INTEGER as total_capacity,
    COALESCE(SUM(current_active_calls), 0)::INTEGER as used_capacity,
    COALESCE(SUM(max_concurrent_calls - current_active_calls), 0)::INTEGER as available_capacity,
    COUNT(*)::INTEGER as active_accounts
  FROM vapi_accounts
  WHERE user_id = user_uuid
    AND is_active = true
    AND status IN ('active', 'standby');
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. Trigger: Otomatik Kapasite Kontrolü
-- =====================================================

-- Hesap kapasitesi dolduğunda otomatik status güncelle
CREATE OR REPLACE FUNCTION check_account_capacity()
RETURNS TRIGGER AS $$
BEGIN
  -- Kapasite doldu mu kontrol et
  IF NEW.current_active_calls >= NEW.max_concurrent_calls THEN
    NEW.status = 'capacity_full';
  ELSIF NEW.current_active_calls < NEW.max_concurrent_calls AND NEW.status = 'capacity_full' THEN
    NEW.status = 'active';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_account_capacity ON vapi_accounts;
CREATE TRIGGER trigger_check_account_capacity
  BEFORE UPDATE OF current_active_calls ON vapi_accounts
  FOR EACH ROW
  EXECUTE FUNCTION check_account_capacity();

-- =====================================================
-- 7. Mevcut Verileri Temizle
-- =====================================================

-- Tüm hesapların active_calls sayısını sıfırla (temiz başlangıç)
UPDATE vapi_accounts 
SET current_active_calls = 0,
    status = CASE 
      WHEN status = 'capacity_full' THEN 'active'
      WHEN status = 'error' THEN 'error'
      ELSE 'standby'
    END;

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

-- =====================================================
-- 8. Yorum Güncellemeleri
-- =====================================================

COMMENT ON COLUMN vapi_accounts.max_concurrent_calls IS 'Hesabın maksimum eşzamanlı arama kapasitesi (default: 10)';
COMMENT ON COLUMN vapi_accounts.current_active_calls IS 'Hesabın şu anda aktif olan arama sayısı';
COMMENT ON COLUMN vapi_accounts.status IS 'Hesap durumu: active (kullanılabilir), standby (beklemede), capacity_full (kapasite dolu), error (hata)';
COMMENT ON COLUMN vapi_accounts.total_calls_made IS 'Hesabın toplam yaptığı arama sayısı (istatistik)';

COMMENT ON TABLE vapi_balance_logs_archived IS 'ESKİ BAKIYE SİSTEMİ - Artık kullanılmıyor, sadece arşiv';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Migration sonucu özeti
DO $$
DECLARE
  account_count INTEGER;
  total_capacity INTEGER;
BEGIN
  SELECT COUNT(*), SUM(max_concurrent_calls)
  INTO account_count, total_capacity
  FROM vapi_accounts
  WHERE is_active = true;
  
  RAISE NOTICE '✅ Kapasite Tabanlı Sisteme Geçiş Tamamlandı';
  RAISE NOTICE '📊 Aktif Hesap Sayısı: %', account_count;
  RAISE NOTICE '🚀 Toplam Kapasite: % eşzamanlı arama', total_capacity;
  RAISE NOTICE '💡 Her hesap = 10 eşzamanlı arama kapasitesi';
END $$;