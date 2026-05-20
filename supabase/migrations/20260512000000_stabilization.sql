-- =====================================================
-- VOICETURKO STABILIZATION MIGRATION
-- =====================================================
-- 1. Status enum genişletme (disabled, exhausted)
-- 2. user_pool_assignments tablosu (her user'a 10 key sabit tahsis)
-- 3. Atomic counter RPC fonksiyonları
-- 4. Webhook idempotency
-- 5. Auth trigger (yeni user'a otomatik 10 key tahsis)
-- =====================================================

-- =====================================================
-- 1. STATUS ENUM GENİŞLET
-- =====================================================

ALTER TABLE vapi_accounts DROP CONSTRAINT IF EXISTS vapi_accounts_status_check;
ALTER TABLE vapi_accounts ADD CONSTRAINT vapi_accounts_status_check
  CHECK (status IN ('active','standby','capacity_full','error','disabled','exhausted'));

-- =====================================================
-- 2. USER_POOL_ASSIGNMENTS TABLOSU
-- =====================================================
-- Her user'a sabit 10 VAPI key tahsis edilir.
-- vapi_resources kaynak takibi yapar; bu tablo sadece atama bilgisi.

CREATE TABLE IF NOT EXISTS user_pool_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vapi_account_id uuid NOT NULL REFERENCES vapi_accounts(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  UNIQUE(user_id, vapi_account_id)
);

CREATE INDEX IF NOT EXISTS idx_user_pool_user
  ON user_pool_assignments(user_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_pool_account
  ON user_pool_assignments(vapi_account_id) WHERE is_active = true;

ALTER TABLE user_pool_assignments ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "user_pool_service_role_all" ON user_pool_assignments
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE user_pool_assignments IS 'Her kullanıcıya tahsis edilen VAPI key havuzu (sabit 10 key)';

-- =====================================================
-- 3. ATOMIC COUNTER RPC FONKSİYONLARI
-- =====================================================

CREATE OR REPLACE FUNCTION increment_active_calls(account_id uuid)
RETURNS integer AS $$
  UPDATE vapi_accounts
  SET current_active_calls = current_active_calls + 1,
      total_calls_made = total_calls_made + 1,
      last_used_at = now()
  WHERE id = account_id
  RETURNING current_active_calls;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION decrement_active_calls(account_id uuid)
RETURNS integer AS $$
  UPDATE vapi_accounts
  SET current_active_calls = GREATEST(0, current_active_calls - 1)
  WHERE id = account_id
  RETURNING current_active_calls;
$$ LANGUAGE sql;

COMMENT ON FUNCTION increment_active_calls IS 'Atomic olarak active call sayısını artırır (race condition yok)';
COMMENT ON FUNCTION decrement_active_calls IS 'Atomic olarak active call sayısını azaltır';

-- =====================================================
-- 4. WEBHOOK IDEMPOTENCY
-- =====================================================

ALTER TABLE calls ADD COLUMN IF NOT EXISTS webhook_processed_at timestamptz;

-- vapi_call_id unique olmalı (idempotency için)
DROP INDEX IF EXISTS idx_calls_vapi_call_id_unique;
CREATE UNIQUE INDEX idx_calls_vapi_call_id_unique
  ON calls(vapi_call_id) WHERE vapi_call_id IS NOT NULL;

COMMENT ON COLUMN calls.webhook_processed_at IS 'Çağrı sonu işlemi (sayaç düşme, dakika hesabı) yapıldıysa zaman damgası';

-- =====================================================
-- 5. AUTH TRIGGER: YENİ USER'A OTOMATIK 10 KEY TAHSİS
-- =====================================================

CREATE OR REPLACE FUNCTION assign_pool_keys_to_new_user()
RETURNS trigger AS $$
BEGIN
  -- Henüz atanmamış aktif key'lerden ilk 10'unu seç
  INSERT INTO user_pool_assignments (user_id, vapi_account_id)
  SELECT NEW.id, va.id
  FROM vapi_accounts va
  WHERE va.is_active = true
    AND va.status IN ('active', 'standby')
    AND NOT EXISTS (
      SELECT 1 FROM user_pool_assignments upa
      WHERE upa.vapi_account_id = va.id
        AND upa.is_active = true
    )
  ORDER BY va.priority ASC NULLS LAST, va.created_at ASC
  LIMIT 10;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_created_assign_pool ON auth.users;
CREATE TRIGGER on_user_created_assign_pool
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION assign_pool_keys_to_new_user();

-- =====================================================
-- 6. MEVCUT USER'LARA TAHSİS (BACKFILL)
-- =====================================================
-- Migration çalıştırıldığında mevcut user'lara da 10 key tahsis et

DO $$
DECLARE
  u RECORD;
  assigned_count INTEGER;
BEGIN
  FOR u IN
    SELECT id FROM auth.users
    WHERE id NOT IN (
      SELECT DISTINCT user_id FROM user_pool_assignments WHERE is_active = true
    )
  LOOP
    INSERT INTO user_pool_assignments (user_id, vapi_account_id)
    SELECT u.id, va.id
    FROM vapi_accounts va
    WHERE va.is_active = true
      AND va.status IN ('active', 'standby')
      AND NOT EXISTS (
        SELECT 1 FROM user_pool_assignments upa
        WHERE upa.vapi_account_id = va.id
          AND upa.is_active = true
      )
    ORDER BY va.priority ASC NULLS LAST, va.created_at ASC
    LIMIT 10
    ON CONFLICT (user_id, vapi_account_id) DO NOTHING;

    GET DIAGNOSTICS assigned_count = ROW_COUNT;
    RAISE NOTICE 'User %: % key tahsis edildi', u.id, assigned_count;
  END LOOP;
END $$;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

DO $$
DECLARE
  total_users INTEGER;
  total_assignments INTEGER;
  total_keys INTEGER;
BEGIN
  SELECT COUNT(DISTINCT user_id) INTO total_users
  FROM user_pool_assignments WHERE is_active = true;

  SELECT COUNT(*) INTO total_assignments
  FROM user_pool_assignments WHERE is_active = true;

  SELECT COUNT(*) INTO total_keys
  FROM vapi_accounts WHERE is_active = true;

  RAISE NOTICE '✅ Stabilizasyon Migration Tamamlandı';
  RAISE NOTICE '📊 Aktif Key: %', total_keys;
  RAISE NOTICE '👥 Tahsisli User: %', total_users;
  RAISE NOTICE '🔗 Toplam Atama: %', total_assignments;
END $$;
