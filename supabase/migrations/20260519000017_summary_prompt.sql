-- ====================================================
-- ASISTAN OZET KISILIGI (Summary Personality)
-- ====================================================
-- Her asistan kendi ozet kisilğine sahip olabilir.
-- VAPI'nin analysisPlan.summaryPlan.messages[0].content alanına gönderilir.
-- Bu sayede her arama sonunda otomatik Türkçe özet üretilir.
-- ====================================================

-- 1) assistant tablosuna summary_prompt kolonu ekle
ALTER TABLE assistant
  ADD COLUMN IF NOT EXISTS summary_prompt text;

COMMENT ON COLUMN assistant.summary_prompt IS
  'VAPI analysisPlan.summaryPlan icin system prompt. Her arama sonunda transkript bu kişiliğe göre özetlenir. NULL ise sistem varsayılan Türkçe özet kişiliğini kullanır.';

-- 2) Mevcut asistanlara varsayılan kişilik ata (NULL olanlar için)
UPDATE assistant SET summary_prompt = E'Sen profesyonel bir arama analisti asistansın. Verilen telefon görüşmesi transkriptini AŞAĞIDAKİ KURALLARA göre özetle:\n\n[Dil]\n- SADECE TÜRKÇE yaz. Asla İngilizce veya başka bir dil kullanma.\n- Akıcı, net, profesyonel Türkçe.\n\n[İçerik]\n1. KİMLER KONUŞTU: Asistan ve müşterinin isimleri (varsa)\n2. GÖRÜŞMENİN ÖZÜ: 2-3 cümlede ne konuşulduğu\n3. SONUÇ: Müşterinin verdiği yanıt veya alınan karar (kabul/red/erteleme)\n4. ÖNEMLİ NOTLAR: Müşterinin belirttiği özel bilgiler (varsa)\n\n[Format]\n- Markdown veya başlık KULLANMA, sadece düz metin.\n- 3-5 cümle yeterli.\n- Soyut/yorum YOK; sadece transkriptte geçen olgular.\n\n[Yasaklar]\n- "Customer", "Agent", "AI assistant" gibi İngilizce terim YOK.\n- "Müşteri", "Asistan", "Görüşme" kullan.\n- Tahmin yapma, sadece transkriptte geçenleri yaz.'
WHERE summary_prompt IS NULL;

-- 3) Bilgilendirme
DO $$
DECLARE total integer;
BEGIN
  SELECT count(*) INTO total FROM assistant WHERE summary_prompt IS NOT NULL;
  RAISE NOTICE 'Toplam asistan ozet kisiligi olan: %', total;
END $$;
