-- =====================================================
-- ASİSTAN RUNTIME VARIABLES MANIFEST
-- =====================================================
-- Şablondan üretilen asistanların, her arama için VAPI'ye gönderilecek
-- variableValues manifest'ini saklar. Geriye uyumlu (boş array default).
-- =====================================================

-- 1) assistant tablosuna manifest kolonları
ALTER TABLE assistant
  ADD COLUMN IF NOT EXISTS template_slug text,
  ADD COLUMN IF NOT EXISTS runtime_variables jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_assistant_template_slug ON assistant(template_slug);

-- 2) Transcriber kolonları (yoksa eklensin; varsa atlanır)
ALTER TABLE assistant
  ADD COLUMN IF NOT EXISTS transcriber_provider text DEFAULT 'deepgram',
  ADD COLUMN IF NOT EXISTS transcriber_model text DEFAULT 'nova-2',
  ADD COLUMN IF NOT EXISTS transcriber_language text DEFAULT 'tr';

-- 3) Yorumlar
COMMENT ON COLUMN assistant.template_slug IS
  'Asistanın oluşturulduğu şablonun slug''ı (varsa). Custom asistanlar için NULL.';

COMMENT ON COLUMN assistant.runtime_variables IS
  'VAPI assistantOverrides.variableValues için Excel/customer_data eşleme manifesti.
   Yapı: [{ key, label, example, excelColumns[], required, fallback, builtin }]
   Boş array ([]) ise sadece built-in keyler (customerName, customerPhone, customerGender) kullanılır.';

-- 4) Mevcut asistanları backfill (varsa)
-- Eğer template_slug yoksa, hiçbir şey yapmıyoruz; built-in'ler runtime'da eklenecek.

-- 5) Bilgi log'u
DO $$
DECLARE
  total_assistants integer;
BEGIN
  SELECT count(*) INTO total_assistants FROM assistant;
  RAISE NOTICE 'Assistant runtime_variables migration applied. Total assistants: %', total_assistants;
END $$;
