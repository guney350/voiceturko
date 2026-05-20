-- =====================================================
-- INDUSTRIES (SEKTÖRLER) + 10 SEKTÖR × USE CASE'LER
-- =====================================================
-- Yapı: Sektör → Use Case (Şablon) → Doldurulacak Alanlar
-- =====================================================

-- 1. INDUSTRIES TABLOSU
CREATE TABLE IF NOT EXISTS industries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  icon text,
  color text DEFAULT 'gray',
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_industries_active ON industries(is_active, display_order);

ALTER TABLE industries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "industries_read_all" ON industries FOR SELECT USING (is_active = true);

-- 2. ASSISTANT_TEMPLATES'a INDUSTRY + USE_CASE EKLE
ALTER TABLE assistant_templates
  ADD COLUMN IF NOT EXISTS industry_id uuid REFERENCES industries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS use_case text,
  ADD COLUMN IF NOT EXISTS estimated_duration_seconds integer DEFAULT 60;

CREATE INDEX IF NOT EXISTS idx_templates_industry ON assistant_templates(industry_id, display_order);

-- =====================================================
-- 10 SEKTÖR SEED
-- =====================================================

INSERT INTO industries (slug, name, description, icon, color, display_order) VALUES
  ('hotel',       'Otel & Konaklama',      'Otel, pansiyon, tatil köyü işletmeleri için',                      '🏨', 'blue',    1),
  ('dental',      'Diş Hekimi & Klinik',   'Diş klinikleri, ortodonti, ağız diş sağlığı',                      '🦷', 'cyan',    2),
  ('realestate',  'Emlak & Gayrimenkul',   'Emlak ofisleri, satış ve kiralama temsilcileri',                   '🏠', 'green',   3),
  ('clinic',      'Estetik & Sağlık',      'Güzellik merkezi, estetik klinik, fizyoterapi, plastik cerrahi',   '💉', 'pink',    4),
  ('restaurant',  'Restoran & Cafe',       'Restoran, cafe, catering, yemek işletmeleri',                      '🍽️', 'orange',  5),
  ('fitness',     'Spor Salonu & Wellness', 'Gym, pilates, yoga stüdyoları, spa',                             '💪', 'red',     6),
  ('education',   'Eğitim & Kurs Merkezi', 'Dil kursları, üniversite hazırlık, online eğitim',                 '📚', 'indigo',  7),
  ('automotive',  'Otomotiv',              'Galeri, oto servis, lastik bayisi, ekspertiz',                     '🚗', 'slate',   8),
  ('ecommerce',   'E-ticaret & Perakende', 'Online mağaza, satış sonrası destek, sipariş takibi',              '🛒', 'purple',  9),
  ('insurance',   'Sigorta & Finans',      'Sigorta acentesi, finans danışmanı, kredi',                        '🛡️', 'amber',   10)
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- HELPER: Industry ID Lookup
-- =====================================================
-- Aşağıdaki INSERT'lerde DO bloğu içinde lookup yapılır

DO $$
DECLARE
  ind_hotel       uuid := (SELECT id FROM industries WHERE slug = 'hotel');
  ind_dental      uuid := (SELECT id FROM industries WHERE slug = 'dental');
  ind_realestate  uuid := (SELECT id FROM industries WHERE slug = 'realestate');
  ind_clinic      uuid := (SELECT id FROM industries WHERE slug = 'clinic');
  ind_restaurant  uuid := (SELECT id FROM industries WHERE slug = 'restaurant');
  ind_fitness     uuid := (SELECT id FROM industries WHERE slug = 'fitness');
  ind_education   uuid := (SELECT id FROM industries WHERE slug = 'education');
  ind_automotive  uuid := (SELECT id FROM industries WHERE slug = 'automotive');
  ind_ecommerce   uuid := (SELECT id FROM industries WHERE slug = 'ecommerce');
  ind_insurance   uuid := (SELECT id FROM industries WHERE slug = 'insurance');
  std_voice jsonb := '{"provider":"11labs","voiceId":"oPC5I9GKjMReiaM29gjY","model":"eleven_v3","speed":1.05,"stability":0.6,"similarityBoost":0.75}'::jsonb;
  std_transcriber jsonb := '{"provider":"deepgram","model":"nova-2","language":"tr"}'::jsonb;
  std_stop jsonb := '{"numWords":3,"voiceSeconds":0.2,"backoffSeconds":0}'::jsonb;
BEGIN

-- ===== Eski şablonları güncelle (industry assign et) =====
UPDATE assistant_templates SET industry_id = ind_hotel, use_case = 'survey' WHERE slug = 'hotel-survey';
UPDATE assistant_templates SET industry_id = ind_ecommerce, use_case = 'sales' WHERE slug = 'sales-pitch';
UPDATE assistant_templates SET industry_id = ind_dental, use_case = 'appointment' WHERE slug = 'appointment-reminder';
UPDATE assistant_templates SET industry_id = ind_ecommerce, use_case = 'satisfaction' WHERE slug = 'customer-satisfaction';
UPDATE assistant_templates SET industry_id = ind_ecommerce, use_case = 'announcement' WHERE slug = 'info-broadcast';

-- ===== OTEL & KONAKLAMA (ek şablonlar) =====
INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template, is_featured) VALUES
('hotel-reservation', 'Rezervasyon Teyidi', 'Yaklaşan rezervasyonları telefonla teyit eden asistan', '✅', 'survey', ind_hotel, 'reservation', 1,
  '[
    {"id":"HOTEL_NAME","label":"Otel Adı","type":"text","required":true,"placeholder":"Hattuşa Tatil Köyü"},
    {"id":"ASSISTANT_NAME","label":"Asistan İsmi","type":"text","required":true,"default":"Ayşe","placeholder":"Ayşe"},
    {"id":"CHECKIN_INFO","label":"Giriş Bilgisi","type":"text","required":true,"placeholder":"yarın saat 14:00","help":"Misafirin check-in zamanı"},
    {"id":"CONTACT_PHONE","label":"Otel Telefonu","type":"text","required":true,"placeholder":"0266 555 12 34"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage', 'Merhaba {{customerName}}, müsait misiniz?',
    'firstMessageMode', 'assistant-speaks-first',
    'backgroundSound', 'office',
    'endCallMessage', 'Sizi otelimizde görmekten mutluluk duyacağız, iyi günler!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.3,'maxTokens',1500,'messages', jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
Rol: {{HOTEL_NAME}} adına rezervasyon teyidi yapan sanal asistan
İsim: {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, ben {{ASSISTANT_NAME}}, {{HOTEL_NAME}}''den arıyorum. {{CHECKIN_INFO}} rezervasyonunuzu teyit etmek için aradım. Misafirimiz olacaksınız değil mi?"

[Onay yolu]
- EVET: "Mükemmel, hazırlığımızı yapacağız. Görüşmek üzere!"
- İPTAL: "Anlıyorum, sorun değil. Yeni bir tarihte misafirimiz olmak ister misiniz?"
- TELEFON: "{{CONTACT_PHONE}} numarasından bize ulaşabilirsiniz."

[Kurallar]
- Kısa ve net, 90 saniyeyi geçmeyin
- Adres/ulaşım: "Detaylar email ile gönderildi"'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  ), true) ON CONFLICT (slug) DO NOTHING;

INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template) VALUES
('hotel-payment-reminder', 'Tahsilat Hatırlatma', 'Vadesi gelen rezervasyon ödemelerini hatırlatır', '💳', 'sales', ind_hotel, 'payment', 2,
  '[
    {"id":"HOTEL_NAME","label":"Otel Adı","type":"text","required":true,"placeholder":"Hattuşa Tatil Köyü"},
    {"id":"ASSISTANT_NAME","label":"Asistan İsmi","type":"text","required":true,"default":"Mehmet","placeholder":"Mehmet"},
    {"id":"PAYMENT_INFO","label":"Ödeme Bilgisi","type":"text","required":true,"placeholder":"2.500₺ rezervasyon bedeli","help":"Tutar ve açıklama"},
    {"id":"PAYMENT_LINK","label":"Ödeme Linki/IBAN","type":"text","required":true,"placeholder":"TR12 3456 ... veya ödeme linki"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?',
    'firstMessageMode','assistant-speaks-first',
    'backgroundSound','office',
    'endCallMessage','Vakit ayırdığınız için teşekkürler!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.2,'maxTokens',1500,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
Rol: {{HOTEL_NAME}} muhasebe departmanı asistanı
İsim: {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, ben {{ASSISTANT_NAME}}, {{HOTEL_NAME}}''den arıyorum. {{PAYMENT_INFO}} için hatırlatma yapmak istedim, müsait misiniz?"

[İçerik]
"{{PAYMENT_INFO}} ödemesini şu adresten yapabilirsiniz: {{PAYMENT_LINK}}"

[Sorular]
- "Ne zaman ödeyebilirsiniz?" → tarih notunu al
- "Sorun var mı?" → empati göster, çözüm öner

[Kurallar]
- Israrcı olma, samimi ol
- Para konusunda nazik dil kullan'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  )) ON CONFLICT (slug) DO NOTHING;

INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template) VALUES
('hotel-promo', 'Promosyon/Kampanya Duyurusu', 'Sezon kampanyalarını mevcut müşterilere duyurur', '🎉', 'info', ind_hotel, 'promo', 3,
  '[
    {"id":"HOTEL_NAME","label":"Otel Adı","type":"text","required":true,"placeholder":"Hattuşa Tatil"},
    {"id":"ASSISTANT_NAME","label":"Asistan İsmi","type":"text","required":true,"default":"Selin","placeholder":"Selin"},
    {"id":"PROMO_DETAILS","label":"Kampanya","type":"textarea","required":true,"placeholder":"Erken rezervasyon: %30 indirim, Ekim sonuna kadar","help":"Detayları"},
    {"id":"BOOKING_URL","label":"Rezervasyon Linki","type":"text","required":true,"placeholder":"hattusa.com/rezervasyon"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?',
    'firstMessageMode','assistant-speaks-first','backgroundSound','office','endCallMessage','İyi günler!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.3,'maxTokens',1200,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
Rol: {{HOTEL_NAME}} pazarlama asistanı
İsim: {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, ben {{ASSISTANT_NAME}}, {{HOTEL_NAME}}''den arıyorum. Size özel bir kampanya bilgisi vermek istedim, 30 saniye müsait misiniz?"

[Pitch]
"{{PROMO_DETAILS}}"

[Yönlendirme]
"İlgilenirseniz {{BOOKING_URL}} adresinden hemen rezervasyon yapabilir veya bana isteyebilirsiniz, sizin için ayırayım."'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  )) ON CONFLICT (slug) DO NOTHING;

-- ===== DİŞ HEKİMİ =====
INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template, is_featured) VALUES
('dental-checkup-invite', '6 Aylık Kontrol Daveti', 'Periyodik diş kontrolü için randevu daveti', '📅', 'appointment', ind_dental, 'recall', 1,
  '[
    {"id":"CLINIC_NAME","label":"Klinik Adı","type":"text","required":true,"placeholder":"Dr. Mehmet Diş Kliniği"},
    {"id":"ASSISTANT_NAME","label":"Asistan İsmi","type":"text","required":true,"default":"Sevgi","placeholder":"Sevgi"},
    {"id":"LAST_VISIT","label":"Son Ziyaret Süresi","type":"text","required":true,"default":"6 ay","placeholder":"6 ay"},
    {"id":"CONTACT_PHONE","label":"Klinik Telefonu","type":"text","required":true,"placeholder":"0312 555 12 34"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','off','endCallMessage','Sağlıklı günler dilerim!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.2,'maxTokens',1500,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
Rol: {{CLINIC_NAME}} resepsiyon asistanı
İsim: {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, ben {{ASSISTANT_NAME}}, {{CLINIC_NAME}}''den arıyorum. Son ziyaretinizden bu yana {{LAST_VISIT}} geçtiği için kontrol randevusu hatırlatmak için aradım."

[Sorular]
- "Bu hafta ya da gelecek hafta için müsait olduğunuz bir gün var mı?"
- Cevap: not al, "Bizden geri dönüş yapacağız" veya "{{CONTACT_PHONE}} arayabilirsiniz"

[Kurallar]
- 60 saniyeyi geçme, kısa ve samimi konuş'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  ), true) ON CONFLICT (slug) DO NOTHING;

INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template) VALUES
('dental-appointment-reminder', 'Randevu Hatırlatma', 'Yarınki randevuyu hatırlatır + teyit alır', '🦷', 'appointment', ind_dental, 'reminder', 2,
  '[
    {"id":"CLINIC_NAME","label":"Klinik Adı","type":"text","required":true,"placeholder":"Dr. Mehmet Diş"},
    {"id":"ASSISTANT_NAME","label":"Asistan İsmi","type":"text","required":true,"default":"Ayşe","placeholder":"Ayşe"},
    {"id":"APPOINTMENT_TIME","label":"Randevu Zamanı","type":"text","required":true,"placeholder":"yarın saat 14:30"},
    {"id":"DOCTOR_NAME","label":"Doktor İsmi","type":"text","required":true,"placeholder":"Dr. Mehmet Yılmaz"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','off','endCallMessage','Görüşmek üzere!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.2,'maxTokens',1200,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
Rol: {{CLINIC_NAME}} asistanı  ·  İsim: {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, {{CLINIC_NAME}}''den {{ASSISTANT_NAME}}. {{APPOINTMENT_TIME}} {{DOCTOR_NAME}} ile randevunuzu hatırlatmak için aradım. Geleceksiniz değil mi?"

[Onay]
- EVET: "Mükemmel, bekliyoruz!"
- HAYIR: "Anlıyorum, yeni tarih almak ister misiniz?"'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  )) ON CONFLICT (slug) DO NOTHING;

INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template) VALUES
('dental-promo', 'Teşhis/Tedavi Kampanyası', 'İmplant, lazer beyazlatma vb. kampanyaları duyurur', '💎', 'sales', ind_dental, 'promo', 3,
  '[
    {"id":"CLINIC_NAME","label":"Klinik","type":"text","required":true,"placeholder":"Dr. Mehmet Diş"},
    {"id":"ASSISTANT_NAME","label":"Asistan","type":"text","required":true,"default":"Burcu","placeholder":"Burcu"},
    {"id":"SERVICE_NAME","label":"Hizmet","type":"text","required":true,"placeholder":"İmplant tedavisi"},
    {"id":"OFFER","label":"Teklif","type":"textarea","required":true,"placeholder":"%30 indirimle 5000₺ - 31 Aralık''a kadar"},
    {"id":"BOOKING_PHONE","label":"Randevu Telefonu","type":"text","required":true,"placeholder":"0312 555 12 34"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','office','endCallMessage','İyi günler!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.3,'maxTokens',1500,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
Rol: {{CLINIC_NAME}} pazarlama asistanı  ·  İsim: {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, {{CLINIC_NAME}}''den {{ASSISTANT_NAME}}. Size {{SERVICE_NAME}} ile ilgili özel bir kampanyamızı anlatmak istiyorum, 1 dakika ayırabilir misiniz?"

[Pitch]
"{{OFFER}}"

[Closing]
"İlgilenirseniz {{BOOKING_PHONE}} numarasından randevu alabilirsiniz."'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  )) ON CONFLICT (slug) DO NOTHING;

-- ===== EMLAK =====
INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template, is_featured) VALUES
('realestate-need-survey', 'İhtiyaç Sorgulama', 'Potansiyel alıcı/kiracının ihtiyacını öğrenip uygun ilan teklif eder', '🏠', 'survey', ind_realestate, 'lead', 1,
  '[
    {"id":"AGENCY_NAME","label":"Emlak Ofisi","type":"text","required":true,"placeholder":"ABC Emlak"},
    {"id":"ASSISTANT_NAME","label":"Asistan İsmi","type":"text","required":true,"default":"Murat","placeholder":"Murat"},
    {"id":"CITY","label":"Bölge","type":"text","required":true,"placeholder":"Ankara Çankaya"},
    {"id":"AGENT_PHONE","label":"Danışman Telefonu","type":"text","required":true,"placeholder":"0532 555 12 34"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','office','endCallMessage','Görüşmek üzere!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.3,'maxTokens',2000,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
Rol: {{AGENCY_NAME}} {{CITY}} bölgesi emlak danışmanı asistanı
İsim: {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, ben {{ASSISTANT_NAME}}, {{AGENCY_NAME}}''den arıyorum. Site/uygulamadan emlak baktığınızı gördüm, size en uygun seçenekleri sunabilmem için birkaç soru sormak istedim. Müsait misiniz?"

[Sorular]
1) "Satılık mı kiralık mı arıyorsunuz?"
2) "{{CITY}} dışında alternatif bölgeleriniz var mı?"
3) "Kaç odalı ve yaklaşık metrekare?"
4) "Bütçeniz nedir?"
5) "Ne zaman taşınmayı düşünüyorsunuz?"

[Closing]
"Bilgilerinizi danışmanımız {{AGENT_PHONE}}''a iletiyorum, en kısa sürede sizi arayıp uygun ilanları gönderecek."'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  ), true) ON CONFLICT (slug) DO NOTHING;

INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template) VALUES
('realestate-viewing-confirm', 'Görüntüleme Randevusu', 'Daire görme randevularını teyit eder', '🗝️', 'appointment', ind_realestate, 'appointment', 2,
  '[
    {"id":"AGENCY_NAME","label":"Emlak Ofisi","type":"text","required":true,"placeholder":"ABC Emlak"},
    {"id":"ASSISTANT_NAME","label":"Asistan","type":"text","required":true,"default":"Selin"},
    {"id":"PROPERTY_INFO","label":"Daire Bilgisi","type":"text","required":true,"placeholder":"Çankaya 3+1 satılık daire"},
    {"id":"VIEWING_TIME","label":"Görüntüleme Saati","type":"text","required":true,"placeholder":"yarın saat 15:00"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','office','endCallMessage','Görüşmek üzere!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.2,'maxTokens',1200,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
{{AGENCY_NAME}} asistanı  ·  {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, {{AGENCY_NAME}}''den {{ASSISTANT_NAME}}. {{PROPERTY_INFO}} için {{VIEWING_TIME}} randevumuzu teyit etmek için aradım."

[Confirmation]
- EVET: "Mükemmel, sizi orada bekliyoruz!"
- ERTELE: "Anlıyorum, ne zaman müsait olursunuz?"'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  )) ON CONFLICT (slug) DO NOTHING;

-- ===== KLİNİK / ESTETİK =====
INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template, is_featured) VALUES
('clinic-promo', 'Estetik Kampanya', 'Lazer epilasyon, botoks vb. kampanyaları duyurur', '✨', 'sales', ind_clinic, 'promo', 1,
  '[
    {"id":"CLINIC_NAME","label":"Klinik Adı","type":"text","required":true,"placeholder":"Beauty Klinik"},
    {"id":"ASSISTANT_NAME","label":"Asistan İsmi","type":"text","required":true,"default":"Ela","placeholder":"Ela"},
    {"id":"SERVICE","label":"Hizmet","type":"text","required":true,"placeholder":"Lazer epilasyon paketi"},
    {"id":"DISCOUNT","label":"İndirim","type":"text","required":true,"placeholder":"%40 indirim - sınırlı süre"},
    {"id":"BOOKING_PHONE","label":"Telefon","type":"text","required":true,"placeholder":"0312 555 12 34"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','office','endCallMessage','İyi günler!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.3,'maxTokens',1200,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
{{CLINIC_NAME}} pazarlama asistanı  ·  {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, ben {{ASSISTANT_NAME}}, {{CLINIC_NAME}}''den arıyorum. {{SERVICE}} için size özel bir kampanyamızı duyurmak istedim, 1 dakika müsait misiniz?"

[Pitch]
"{{DISCOUNT}}"

[Closing]
"Randevu için {{BOOKING_PHONE}} numarasından bize ulaşabilirsiniz."'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  ), true) ON CONFLICT (slug) DO NOTHING;

-- ===== RESTORAN =====
INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template, is_featured) VALUES
('restaurant-reservation', 'Rezervasyon Teyidi', 'Yemek rezervasyonlarını teyit eder', '🍽️', 'appointment', ind_restaurant, 'reservation', 1,
  '[
    {"id":"RESTAURANT_NAME","label":"Restoran","type":"text","required":true,"placeholder":"Lezzet Restoran"},
    {"id":"ASSISTANT_NAME","label":"Asistan","type":"text","required":true,"default":"Ahmet"},
    {"id":"RESERVATION_TIME","label":"Rezervasyon","type":"text","required":true,"placeholder":"bu akşam saat 20:00, 4 kişilik"},
    {"id":"CONTACT_PHONE","label":"Restoran Telefonu","type":"text","required":true,"placeholder":"0212 555 12 34"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','off','endCallMessage','İyi günler!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.2,'maxTokens',1200,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
{{RESTAURANT_NAME}} asistanı  ·  {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, {{RESTAURANT_NAME}}''den {{ASSISTANT_NAME}}. {{RESERVATION_TIME}} rezervasyonunuzu teyit etmek istedim, geleceksiniz değil mi?"

[Confirmation]
- EVET: "Mükemmel, masanız hazır olacak!"
- İPTAL: "Anlıyorum, başka bir tarihte misafirimiz olmak ister misiniz?"
- ERTELE: "Tabii, ne zaman müsait olursunuz?"

Telefon: {{CONTACT_PHONE}}'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  ), true) ON CONFLICT (slug) DO NOTHING;

-- ===== SPOR SALONU =====
INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template, is_featured) VALUES
('fitness-renewal', 'Üyelik Yenileme', 'Üyeliği bitmek üzere olan müşterilere yenileme teklifi', '💪', 'sales', ind_fitness, 'renewal', 1,
  '[
    {"id":"GYM_NAME","label":"Spor Salonu","type":"text","required":true,"placeholder":"FitLife Gym"},
    {"id":"ASSISTANT_NAME","label":"Asistan","type":"text","required":true,"default":"Cem"},
    {"id":"EXPIRY_INFO","label":"Bitiş Bilgisi","type":"text","required":true,"placeholder":"15 günde üyeliğiniz dolacak"},
    {"id":"OFFER","label":"Teklif","type":"text","required":true,"placeholder":"6 ay yenilemede %25 indirim"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','off','endCallMessage','Spor yaparken görüşmek üzere!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.3,'maxTokens',1500,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
{{GYM_NAME}} pazarlama asistanı  ·  {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, {{GYM_NAME}}''den {{ASSISTANT_NAME}}. {{EXPIRY_INFO}}. Yenileme teklifi sunmak için aradım, müsait misiniz?"

[Pitch]
"{{OFFER}}"

[Closing]
"İlgilenirseniz salona uğrayıp kayıt yaptırabilir veya bilgi almak için bana sorabilirsiniz."'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  ), true) ON CONFLICT (slug) DO NOTHING;

-- ===== EĞİTİM =====
INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template, is_featured) VALUES
('education-info', 'Kurs Bilgilendirme', 'Kayıt sürecinde olan adaylara kurs bilgisi verir', '📚', 'sales', ind_education, 'info', 1,
  '[
    {"id":"SCHOOL_NAME","label":"Kurum Adı","type":"text","required":true,"placeholder":"ABC İngilizce Kursu"},
    {"id":"ASSISTANT_NAME","label":"Asistan","type":"text","required":true,"default":"Deniz"},
    {"id":"COURSE_NAME","label":"Kurs","type":"text","required":true,"placeholder":"Genel İngilizce A2-B1"},
    {"id":"START_DATE","label":"Başlangıç","type":"text","required":true,"placeholder":"1 Aralık"},
    {"id":"BOOKING_PHONE","label":"Telefon","type":"text","required":true,"placeholder":"0212 555 12 34"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','office','endCallMessage','İyi günler!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.3,'maxTokens',1500,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
{{SCHOOL_NAME}} asistanı  ·  {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, {{SCHOOL_NAME}}''den {{ASSISTANT_NAME}}. {{COURSE_NAME}} kursumuzla ilgilendiğiniz için aradım, kısa bilgi verebilir miyim?"

[Bilgi]
"Kurs {{START_DATE}} başlıyor. Detaylar için kaydolmak isterseniz {{BOOKING_PHONE}} numarasından bize ulaşabilirsiniz."

[Sorular]
- "Sınıf zamanı önemli mi sizin için?"
- "Online mi yüzyüze mi tercih ediyorsunuz?"'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  ), true) ON CONFLICT (slug) DO NOTHING;

-- ===== OTOMOTİV =====
INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template, is_featured) VALUES
('auto-service-reminder', 'Servis/Bakım Hatırlatma', 'Periyodik bakım için hatırlatma', '🔧', 'appointment', ind_automotive, 'maintenance', 1,
  '[
    {"id":"SERVICE_NAME","label":"Servis Adı","type":"text","required":true,"placeholder":"ABC Oto Servis"},
    {"id":"ASSISTANT_NAME","label":"Asistan","type":"text","required":true,"default":"Hakan"},
    {"id":"VEHICLE_INFO","label":"Araç Bilgisi","type":"text","required":true,"placeholder":"Volkswagen Polo"},
    {"id":"DURATION","label":"Süre","type":"text","required":true,"placeholder":"6 ay"},
    {"id":"BOOKING_PHONE","label":"Telefon","type":"text","required":true,"placeholder":"0212 555 12 34"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','off','endCallMessage','İyi günler!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.2,'maxTokens',1500,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
{{SERVICE_NAME}} resepsiyon asistanı  ·  {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, {{SERVICE_NAME}}''den {{ASSISTANT_NAME}}. {{VEHICLE_INFO}} aracınız için {{DURATION}} bakım zamanı geldi, randevu almak ister misiniz?"

[Randevu]
- EVET: tarih sor → not al
- "Bu hafta/gelecek hafta müsait misiniz?"

[Closing]
"Randevu için {{BOOKING_PHONE}} arayabilir veya size uygun saati söyleyin, kaydedeyim."'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  ), true) ON CONFLICT (slug) DO NOTHING;

-- ===== E-TİCARET =====
INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template, is_featured) VALUES
('ecommerce-order-confirm', 'Sipariş Teyidi', 'Yeni siparişin alındığını ve teslimat detayını bildirir', '📦', 'info', ind_ecommerce, 'order', 1,
  '[
    {"id":"STORE_NAME","label":"Mağaza Adı","type":"text","required":true,"placeholder":"ABC Mağaza"},
    {"id":"ASSISTANT_NAME","label":"Asistan","type":"text","required":true,"default":"Nur"},
    {"id":"DELIVERY_INFO","label":"Teslimat Bilgisi","type":"text","required":true,"placeholder":"2-3 iş günü içinde kargoya verilecek"},
    {"id":"SUPPORT_PHONE","label":"Destek Telefonu","type":"text","required":true,"placeholder":"0212 555 12 34"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','off','endCallMessage','İyi alışverişler!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.2,'maxTokens',1200,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
{{STORE_NAME}} müşteri hizmetleri asistanı  ·  {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, {{STORE_NAME}}''den {{ASSISTANT_NAME}}. Siparişinizi aldığımızı teyit etmek için aradım."

[İçerik]
"{{DELIVERY_INFO}}"

[Closing]
"Soru veya değişiklik için {{SUPPORT_PHONE}} numarasından ulaşabilirsiniz."'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  ), true) ON CONFLICT (slug) DO NOTHING;

INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template) VALUES
('ecommerce-cart-abandon', 'Sepet Hatırlatma', 'Sepete ürün ekleyip almayan müşteriye hatırlatma', '🛒', 'sales', ind_ecommerce, 'cart', 2,
  '[
    {"id":"STORE_NAME","label":"Mağaza","type":"text","required":true,"placeholder":"ABC Mağaza"},
    {"id":"ASSISTANT_NAME","label":"Asistan","type":"text","required":true,"default":"Pınar"},
    {"id":"DISCOUNT_CODE","label":"İndirim Kodu","type":"text","placeholder":"WELCOME10"},
    {"id":"DISCOUNT_AMOUNT","label":"İndirim Oranı","type":"text","placeholder":"%10"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','off','endCallMessage','İyi günler!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.3,'maxTokens',1200,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
{{STORE_NAME}} pazarlama asistanı  ·  {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, {{STORE_NAME}}''den {{ASSISTANT_NAME}}. Sitemizde sepetinize eklediğiniz ürünleri gördüm, satın almayı tamamlamak ister misiniz?"

[Teşvik]
"Size özel {{DISCOUNT_CODE}} kodunu kullanarak {{DISCOUNT_AMOUNT}} indirim alabilirsiniz."

[Closing]
"İlgilenirseniz hemen sepetinize dönebilirsiniz, iyi günler!"'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  )) ON CONFLICT (slug) DO NOTHING;

-- ===== SİGORTA =====
INSERT INTO assistant_templates (slug, name, description, icon, category, industry_id, use_case, display_order, fields, template, is_featured) VALUES
('insurance-renewal', 'Poliçe Yenileme', 'Sigorta poliçesi bitmek üzere olan müşterilere hatırlatma', '🛡️', 'sales', ind_insurance, 'renewal', 1,
  '[
    {"id":"AGENCY_NAME","label":"Acente","type":"text","required":true,"placeholder":"ABC Sigorta"},
    {"id":"ASSISTANT_NAME","label":"Asistan","type":"text","required":true,"default":"Cansu"},
    {"id":"POLICY_TYPE","label":"Poliçe","type":"text","required":true,"placeholder":"trafik sigortanız"},
    {"id":"EXPIRY_DATE","label":"Bitiş","type":"text","required":true,"placeholder":"15 gün içinde"},
    {"id":"AGENT_PHONE","label":"Telefon","type":"text","required":true,"placeholder":"0312 555 12 34"}
  ]'::jsonb,
  jsonb_build_object(
    'firstMessage','Merhaba {{customerName}}, müsait misiniz?','firstMessageMode','assistant-speaks-first','backgroundSound','office','endCallMessage','İyi günler!',
    'model', jsonb_build_object('provider','groq','model','openai/gpt-oss-20b','temperature',0.3,'maxTokens',1500,'messages',jsonb_build_array(jsonb_build_object('role','system','content',
'[Identity]
{{AGENCY_NAME}} sigorta asistanı  ·  {{ASSISTANT_NAME}}

[Opening]
"Merhaba {{customerName}}, {{AGENCY_NAME}}''den {{ASSISTANT_NAME}}. {{POLICY_TYPE}} {{EXPIRY_DATE}} sona erecek, yenileme için hatırlatmak istedim."

[İçerik]
"Sizin için yenileme teklifi hazırladık, en uygun fiyatla sunabiliriz."

[Closing]
"Bilgi almak veya yenilemek için {{AGENT_PHONE}} arayabilirsiniz, vakit ayırdığınız için teşekkürler."'))),
    'voice', std_voice, 'stopSpeakingPlan', std_stop, 'transcriber', std_transcriber
  ), true) ON CONFLICT (slug) DO NOTHING;

END $$;

-- =====================================================
-- DONE
-- =====================================================
DO $$
DECLARE
  v_industries integer;
  v_templates integer;
BEGIN
  SELECT COUNT(*) INTO v_industries FROM industries WHERE is_active = true;
  SELECT COUNT(*) INTO v_templates FROM assistant_templates WHERE is_active = true;
  RAISE NOTICE '✅ % sektör yüklendi', v_industries;
  RAISE NOTICE '✅ % şablon yüklendi', v_templates;
END $$;
