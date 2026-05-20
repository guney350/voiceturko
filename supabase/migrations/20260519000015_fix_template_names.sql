-- =====================================================
-- FIX: Şablon isimlerini ve açıklamalarını düzgün Türkçe ile yeniden yaz
-- =====================================================
-- PowerShell clipboard encoding sorunundan dolayı bozulan
-- name + description + icon alanlarını düzeltir.
-- =====================================================

UPDATE assistant_templates SET
  name = 'Otel ve Tatil Anketi',
  description = 'Tatil tercihleri anketi yaparak veri toplar; cekilis ile katilim saglar.',
  icon = 'BedDouble'
WHERE slug = 'hotel-survey';

UPDATE assistant_templates SET
  name = 'Otel Rezervasyon Onayi',
  description = 'Misafirin rezervasyonunu onaylar, transfer ve ozel istekleri sorar.',
  icon = 'BellRing'
WHERE slug = 'hotel-reservation-confirm';

UPDATE assistant_templates SET
  name = 'Dis Randevu Hatirlatma',
  description = 'Yaklasan dis randevusunu hatirlatir, onay alir veya iptali yonetir.',
  icon = 'Stethoscope'
WHERE slug = 'dental-appointment-reminder';

UPDATE assistant_templates SET
  name = 'Estetik Klinik Kampanyasi',
  description = 'Mevcut/potansiyel musterilere ozel kampanyayi tanitir, ilgi varsa randevu onerir.',
  icon = 'Syringe'
WHERE slug = 'clinic-promo-campaign';

UPDATE assistant_templates SET
  name = 'Emlak Mulk Geri Arama',
  description = 'Ilana ilgi gosteren musteriyle iletisime gecer, gorusme randevusu onerir.',
  icon = 'Home'
WHERE slug = 'realestate-followup';

UPDATE assistant_templates SET
  name = 'Restoran Rezervasyon Onayi',
  description = 'Ayni gun/aksam rezervasyonu teyit eder; iptal/degisiklik yonetir.',
  icon = 'UtensilsCrossed'
WHERE slug = 'restaurant-reservation';

UPDATE assistant_templates SET
  name = 'Spor Salonu Uye Geri Kazanim',
  description = 'Uyeligi biten/aralik veren uyelere ozel teklif ile geri donus cagrisi.',
  icon = 'Dumbbell'
WHERE slug = 'fitness-winback';

UPDATE assistant_templates SET
  name = 'Egitim Kayit Daveti',
  description = 'Yeni donem kayitlari icin ilgili ogrenci/veliyi bilgilendirip kayit randevusu onerir.',
  icon = 'GraduationCap'
WHERE slug = 'education-enrollment';

UPDATE assistant_templates SET
  name = 'Otomotiv Servis Hatirlatma',
  description = 'Periyodik bakim/muayene zamanini hatirlatir, randevu onerir.',
  icon = 'Car'
WHERE slug = 'auto-service-reminder';

UPDATE assistant_templates SET
  name = 'Test Surusu Daveti',
  description = 'Yeni model cikisi/ilgilenen musteri icin test surusu randevusu onerir.',
  icon = 'CarFront'
WHERE slug = 'auto-testdrive-invite';

UPDATE assistant_templates SET
  name = 'E-Ticaret Sepet Hatirlatma',
  description = 'Sepetinde urun birakan musteriyi nazikce arayarak indirim teklif eder.',
  icon = 'ShoppingCart'
WHERE slug = 'ecommerce-cart-recovery';

UPDATE assistant_templates SET
  name = 'Siparis Sonrasi Memnuniyet',
  description = 'Teslim edilen siparis icin kisa NPS skoru ve yorum toplar.',
  icon = 'Star'
WHERE slug = 'ecommerce-review-nps';

UPDATE assistant_templates SET
  name = 'Sigorta Police Yenileme',
  description = 'Bitis tarihi yaklasan policeleri hatirlatir, yenileme sureci icin yonlendirir.',
  icon = 'ShieldCheck'
WHERE slug = 'insurance-policy-renewal';

UPDATE assistant_templates SET
  name = 'Odeme ve Tahsilat Hatirlatma',
  description = 'Vadesi yaklasan veya gecmis odemeyi nazik dille hatirlatir.',
  icon = 'CreditCard'
WHERE slug = 'payment-reminder';

UPDATE assistant_templates SET
  name = 'Kargo Teslimat Bilgilendirmesi',
  description = 'Yarin/bugun teslim edilecek kargoyu onceden haber verir, musait olunup olunmadigini sorar.',
  icon = 'Package'
WHERE slug = 'logistics-delivery-info';

UPDATE assistant_templates SET
  name = 'Hizmet Sonrasi Memnuniyet (NPS)',
  description = 'Hizmet alimi sonrasi kisa NPS skoru ve geri bildirim toplar.',
  icon = 'BarChart3'
WHERE slug = 'callcenter-nps';

UPDATE assistant_templates SET
  name = 'Guzellik Salonu Randevu',
  description = 'Sac/cilt/manikur gibi randevulari hatirlatir, kampanya bilgisi paylasir.',
  icon = 'Sparkles'
WHERE slug = 'beauty-appointment';

UPDATE assistant_templates SET
  name = 'Genel Duyuru ve Bilgilendirme',
  description = 'Etkinlik, acilis, firsat duyurusu icin her sektorde kullanilabilir.',
  icon = 'Megaphone'
WHERE slug = 'generic-announcement';

-- Industries (sektör) tablosundaki bozulmuş isimleri de düzelt
UPDATE industries SET name = 'Otel ve Konaklama', description = 'Otel, pansiyon, tatil koyu isletmeleri icin' WHERE slug = 'hotel';
UPDATE industries SET name = 'Dis Hekimi ve Klinik', description = 'Dis klinikleri, ortodonti, agiz dis sagligi' WHERE slug = 'dental';
UPDATE industries SET name = 'Emlak ve Gayrimenkul', description = 'Emlak ofisleri, satis ve kiralama temsilcileri' WHERE slug = 'realestate';
UPDATE industries SET name = 'Estetik ve Saglik', description = 'Guzellik merkezi, estetik klinik, fizyoterapi, plastik cerrahi' WHERE slug = 'clinic';
UPDATE industries SET name = 'Restoran ve Cafe', description = 'Restoran, cafe, catering, yemek isletmeleri' WHERE slug = 'restaurant';
UPDATE industries SET name = 'Spor Salonu ve Wellness', description = 'Gym, pilates, yoga studyolari, spa' WHERE slug = 'fitness';
UPDATE industries SET name = 'Egitim ve Kurs Merkezi', description = 'Dil kurslari, universite hazirlik, online egitim' WHERE slug = 'education';
UPDATE industries SET name = 'Otomotiv', description = 'Galeri, oto servis, lastik bayisi, ekspertiz' WHERE slug = 'automotive';
UPDATE industries SET name = 'E-Ticaret ve Perakende', description = 'Online magaza, satis sonrasi destek, siparis takibi' WHERE slug = 'ecommerce';
UPDATE industries SET name = 'Sigorta ve Finans', description = 'Sigorta acentesi, finans danismani, kredi' WHERE slug = 'insurance';

-- Bilgilendirme
DO $$
DECLARE total integer;
BEGIN
  SELECT count(*) INTO total FROM assistant_templates WHERE is_active = true;
  RAISE NOTICE 'Sablon isimleri duzeltildi. Toplam: %', total;
END $$;
