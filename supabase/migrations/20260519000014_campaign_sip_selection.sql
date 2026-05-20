-- =====================================================
-- KAMPANYA SIP SEÇİMİ
-- =====================================================
-- Kullanıcının birden fazla SIP'i varsa, kampanya hangi SIP'i kullanacağını
-- bilmeli. campaigns.sip_id NULL ise otomatik seçilir (eski davranış).
-- =====================================================

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS sip_id uuid REFERENCES sips(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_sip ON campaigns(sip_id) WHERE sip_id IS NOT NULL;

COMMENT ON COLUMN campaigns.sip_id IS
  'Kampanya için kullanılacak SIP hattı (telefon numarası).
   NULL ise sistem otomatik olarak kullanıcının herhangi bir SIP''ini seçer.';

-- Bilgilendirme
DO $$
DECLARE total_campaigns integer;
BEGIN
  SELECT count(*) INTO total_campaigns FROM campaigns;
  RAISE NOTICE 'Campaigns.sip_id eklendi. Toplam kampanya: %', total_campaigns;
END $$;
