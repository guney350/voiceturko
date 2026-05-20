-- =====================================================
-- FINALIZE: Legacy tablo cleanup ve schema uyumluluğu
-- =====================================================
-- 1) calls.subscription_id NULL'a izin ver (yeni sistemde subscription yok)
-- 2) usages.subscription_id NULL'a izin ver
-- 3) Eski tablolardaki RLS politikaları kaldırılmaz (veri zaten orada kalıyor)
-- =====================================================

-- 1) calls tablosunda subscription_id artık zorunlu değil
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calls' AND column_name = 'subscription_id'
  ) THEN
    BEGIN
      ALTER TABLE calls ALTER COLUMN subscription_id DROP NOT NULL;
      RAISE NOTICE '✅ calls.subscription_id artık NULL kabul ediyor';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'calls.subscription_id zaten nullable veya başka sorun: %', SQLERRM;
    END;
  END IF;
END $$;

-- 2) usages tablosunda subscription_id artık zorunlu değil
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'usages' AND column_name = 'subscription_id'
  ) THEN
    BEGIN
      ALTER TABLE usages ALTER COLUMN subscription_id DROP NOT NULL;
      RAISE NOTICE '✅ usages.subscription_id artık NULL kabul ediyor';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'usages.subscription_id zaten nullable veya başka sorun: %', SQLERRM;
    END;
  END IF;
END $$;

-- 3) calls.deducted_amount_try + deduction_source kolonları (opsiyonel - billing tracking için)
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS deducted_amount_try numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_source text;

COMMENT ON COLUMN calls.deducted_amount_try IS 'Bu arama için bakiyeden düşülen TL tutarı (Billing tarafından doldurulur)';
COMMENT ON COLUMN calls.deduction_source IS 'package | credit | mixed';

-- 4) İndexler
CREATE INDEX IF NOT EXISTS idx_calls_user_created ON calls(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status, created_at DESC);

-- Bilgilendirme
DO $$
DECLARE
  total_calls integer;
  null_sub integer;
BEGIN
  SELECT count(*) INTO total_calls FROM calls;
  SELECT count(*) INTO null_sub FROM calls WHERE subscription_id IS NULL;
  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE '✅ Legacy cleanup tamamlandı';
  RAISE NOTICE 'Toplam çağrı: %', total_calls;
  RAISE NOTICE 'NULL subscription_id: %', null_sub;
  RAISE NOTICE '═══════════════════════════════════════════';
END $$;
