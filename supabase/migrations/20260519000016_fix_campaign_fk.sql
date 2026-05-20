-- =====================================================
-- FK FIX: campaigns.assistant_id ON DELETE SET NULL
-- =====================================================
-- Asistan silindiğinde kampanya silinmemeli, sadece FK NULL olmalı
-- =====================================================

-- Eski FK'yı kaldır (varsa)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'campaigns_assistant_id_fkey'
      AND table_name = 'campaigns'
  ) THEN
    ALTER TABLE campaigns DROP CONSTRAINT campaigns_assistant_id_fkey;
    RAISE NOTICE 'Eski FK kaldirildi';
  END IF;
END $$;

-- Yeni FK ekle: ON DELETE SET NULL
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'assistant_id'
  ) THEN
    -- assistant_id nullable yap (zaten olabilir)
    ALTER TABLE campaigns ALTER COLUMN assistant_id DROP NOT NULL;
    
    -- Yeni FK
    ALTER TABLE campaigns
      ADD CONSTRAINT campaigns_assistant_id_fkey
      FOREIGN KEY (assistant_id) REFERENCES assistant(id) ON DELETE SET NULL;
    RAISE NOTICE 'Yeni FK eklendi (ON DELETE SET NULL)';
  END IF;
END $$;

-- calls tablosundaki assistant_id de ayni sekilde
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'calls_assistant_id_fkey'
      AND table_name = 'calls'
  ) THEN
    ALTER TABLE calls DROP CONSTRAINT calls_assistant_id_fkey;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
