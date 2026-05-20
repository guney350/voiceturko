-- ============================================================
-- KRITIK FIX: calls.duration_minutes NOT NULL constraint
-- ============================================================
-- Sorun: processor.ts ve sync-all duration_minutes set etmeden INSERT yapiyordu
--        ve bu NOT NULL constraint sebebiyle sessizce basarisiz oluyordu.
--        Bunun sonucu calls tablosuna kayit eklenmiyor, /dashboard/calls bos kaliyor.
-- Cozum: duration_minutes default 0, audio default '', call_type default ''
-- ============================================================

-- 1) duration_minutes: DEFAULT 0, NOT NULL kalsin
ALTER TABLE calls ALTER COLUMN duration_minutes SET DEFAULT 0;

-- 2) audio: DEFAULT '' (eski PHP yapisinda not null'di)
ALTER TABLE calls ALTER COLUMN audio SET DEFAULT '';

-- 3) call_type: DEFAULT 'outboundPhoneCall' (zaten almali ama emin olalim)
ALTER TABLE calls ALTER COLUMN call_type SET DEFAULT 'outboundPhoneCall';

-- 4) Mevcut NULL kayitlari duzelt (varsa)
UPDATE calls SET duration_minutes = 0 WHERE duration_minutes IS NULL;
UPDATE calls SET audio = '' WHERE audio IS NULL;
UPDATE calls SET call_type = 'outboundPhoneCall' WHERE call_type IS NULL;

DO $$
BEGIN
  RAISE NOTICE 'calls tablosu default degerleri ayarlandi (duration_minutes=0, audio='''', call_type=''outboundPhoneCall'')';
END $$;
