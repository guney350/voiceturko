-- =====================================================
-- TEMPLATE FIELDS POLISH — KURUMSAL YARDIM METİNLERİ
-- =====================================================
-- Her form alanına detaylı, profesyonel açıklama ekler.
-- Özellikle telefon alanlarındaki "SIP çıkış numarası vs müşteriye söylenen numara"
-- karışıklığını net bir şekilde ayrıştırır.
--
-- ÖNEMLİ: SIP ayarınız sistemin müşteriyi aradığı çıkış numarasıdır (otomatik).
-- Şablondaki "Telefon" alanları ise ASİSTAN'ın konuşma sırasında müşteriye
-- söyleyeceği iletişim numarasıdır (call-back number).
-- =====================================================

-- ŞABLON 1: hotel-survey
UPDATE assistant_templates SET fields = $F$[
  {"id":"COMPANY_NAME","label":"Otel / Firma Adı","type":"text","required":true,"placeholder":"Hattuşa Sağlık ve Tatil Köyü","help":"Müşterinin telefonda duyacağı firma adı. Resmi unvan yerine müşterilerin tanıdığı kısa isim tercih edin. Örnek: 'Hattuşa Sağlık Tesisleri Tic. A.Ş.' yerine 'Hattuşa Sağlık ve Tatil Köyü'."},
  {"id":"LOCATION","label":"Bölge / Konum","type":"text","required":true,"placeholder":"Balıkesir, Güre","help":"Otelinizin bulunduğu il ve ilçe. Asistan müşteriye 'Sizi Balıkesir, Güre'de bulunan ... adına arıyorum' diyerek lokasyon güveni oluşturacaktır."},
  {"id":"ASSISTANT_NAME","label":"Sanal Temsilci Adı","type":"text","required":true,"default":"Esra","placeholder":"Esra","help":"Asistanın müşteriye kendini tanıtırken kullanacağı isim. Gerçek bir insan ismi (Esra, Ayşe, Selin, Defne) seçin. Müşteri 'Ben Esra, ... adına arıyorum' diye duyacak."},
  {"id":"PRIZE_DETAILS","label":"Çekiliş Ödülü","type":"text","required":true,"default":"3 gündüz 2 gece ücretsiz tatil","placeholder":"3 gece tam pansiyon konaklama","help":"Ankete katılan müşterilere sunulacak ödül. Müşteriyi konuşmaya katılım yapmaya teşvik eden hediye paketi."},
  {"id":"SURVEY_AREA","label":"Anket Yapılan Bölge","type":"text","required":true,"default":"Ege bölgesi","placeholder":"Ege bölgesi","help":"Anketin hangi coğrafi bölgede yapıldığı bilgisi. Müşteriye 'Biz ... bölgesinde 250 ailemize bu anketi yapıyoruz' denilirken kullanılır."}
]$F$::jsonb
WHERE slug = 'hotel-survey';

-- ŞABLON 2: hotel-reservation-confirm
UPDATE assistant_templates SET fields = $F$[
  {"id":"COMPANY_NAME","label":"Otel Adı","type":"text","required":true,"placeholder":"Antalya Sunshine Hotel","help":"Misafirin telefonda duyacağı otel adı. Web sitenizdeki resmi pazarlama adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Temsilci Adı","type":"text","required":true,"default":"Selin","placeholder":"Selin","help":"Resepsiyon görevlisinin kendini tanıtacağı isim. Misafir 'Ben Selin, otelinizin rezervasyon ekibinden arıyorum' diye duyacak."},
  {"id":"CHECKIN_POLICY","label":"Standart Check-in Saati","type":"text","required":true,"default":"saat 14:00","placeholder":"saat 14:00","help":"Otelinizin standart check-in saati. Misafir bilgilendirmesi için kullanılır. Erken giriş politikası varsa belirtin: 'saat 14:00 (erken giriş +50€)'."},
  {"id":"CONTACT_PHONE","label":"Otel Resepsiyon Numarası","type":"text","required":true,"placeholder":"0242 555 12 34","help":"Misafirin sizi tekrar arayabilmesi için telefonda söylenecek otel resepsiyon numarası. ÖNEMLİ: Bu, sistemin çıkış numarası DEĞİLDİR. Sistem müşteriyi SIP ayarlarınızdaki numaradan otomatik arar; bu alan sadece konuşma sırasında müşteriye sözel olarak iletilir."}
]$F$::jsonb
WHERE slug = 'hotel-reservation-confirm';

-- ŞABLON 3: dental-appointment-reminder
UPDATE assistant_templates SET fields = $F$[
  {"id":"CLINIC_NAME","label":"Klinik Adı","type":"text","required":true,"placeholder":"Dr. Mehmet Yılmaz Diş Kliniği","help":"Hastanın telefonda duyacağı klinik adı. Resmi unvan yerine hastaların tanıdığı kısa adı tercih edin."},
  {"id":"ASSISTANT_NAME","label":"Sanal Sekreter Adı","type":"text","required":true,"default":"Ayşegül","placeholder":"Ayşegül","help":"Klinik sekreterinin kendini tanıtacağı isim. Hasta 'Ben Ayşegül, kliniğinizden arıyorum' diye duyacak."},
  {"id":"CONTACT_PHONE","label":"Klinik İletişim Numarası","type":"text","required":true,"placeholder":"0312 555 12 34","help":"Hastanın sizi tekrar arayabilmesi için telefonda söylenecek klinik numarası. ÖNEMLİ: Sistem hastayı SIP ayarlarınızdaki numaradan otomatik arar; bu alan sadece konuşmada sözel olarak söylenecek olan klinik numaranızdır."}
]$F$::jsonb
WHERE slug = 'dental-appointment-reminder';

-- ŞABLON 4: clinic-promo-campaign
UPDATE assistant_templates SET fields = $F$[
  {"id":"CLINIC_NAME","label":"Klinik Adı","type":"text","required":true,"placeholder":"NewSkin Estetik ve Güzellik Merkezi","help":"Müşterinin telefonda duyacağı klinik adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Temsilci Adı","type":"text","required":true,"default":"Defne","placeholder":"Defne","help":"Müşteri ilişkileri uzmanının kendini tanıtacağı isim."},
  {"id":"PROMOTION_NAME","label":"Kampanya Başlığı","type":"text","required":true,"placeholder":"Lazer Epilasyon Yaz Kampanyası","help":"Kampanyanın kısa, net başlığı. Müşteri ilgisini çeken birkaç kelime."},
  {"id":"PROMOTION_DETAILS","label":"Kampanya Detayları","type":"textarea","required":true,"placeholder":"Tüm bölgelerde lazer epilasyon paketinde %40 indirim. Bu kampanya 30 Haziran'a kadar geçerlidir.","help":"Kampanyanın açıklaması; ne sunulduğu, son tarih, kısıtlamalar. 2-3 cümle yeterli — uzun anlatım müşteri ilgisini kaybeder."},
  {"id":"CONTACT_PHONE","label":"Klinik İletişim Numarası","type":"text","required":true,"placeholder":"0212 555 12 34","help":"Müşterinin randevu/bilgi için sizi tekrar arayabilmesi için telefonda söylenecek klinik numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'clinic-promo-campaign';

-- ŞABLON 5: realestate-followup
UPDATE assistant_templates SET fields = $F$[
  {"id":"COMPANY_NAME","label":"Emlak Ofisi Adı","type":"text","required":true,"placeholder":"Ada Gayrimenkul","help":"Müşterinin telefonda duyacağı emlak ofisi adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Müşteri Temsilcisi Adı","type":"text","required":true,"default":"Burak","placeholder":"Burak","help":"Emlak ofisi müşteri ilişkileri temsilcisinin kendini tanıtacağı isim. Hem erkek hem kadın isimleri uygundur."},
  {"id":"CONTACT_PHONE","label":"Emlak Ofisi Numarası","type":"text","required":true,"placeholder":"0312 555 12 34","help":"Müşterinin görüşme/randevu için sizi tekrar arayabilmesi için telefonda söylenecek ofis numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'realestate-followup';

-- ŞABLON 6: restaurant-reservation
UPDATE assistant_templates SET fields = $F$[
  {"id":"RESTAURANT_NAME","label":"Restoran Adı","type":"text","required":true,"placeholder":"Mavi Lokanta","help":"Müşterinin telefonda duyacağı restoran adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Rezervasyon Sorumlusu Adı","type":"text","required":true,"default":"Murat","placeholder":"Murat","help":"Restoran rezervasyon sorumlusunun kendini tanıtacağı isim."},
  {"id":"CONTACT_PHONE","label":"Restoran İletişim Numarası","type":"text","required":true,"placeholder":"0212 555 12 34","help":"Müşterinin rezervasyon değişikliği için sizi tekrar arayabilmesi için telefonda söylenecek restoran numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'restaurant-reservation';

-- ŞABLON 7: fitness-winback
UPDATE assistant_templates SET fields = $F$[
  {"id":"GYM_NAME","label":"Spor Salonu Adı","type":"text","required":true,"placeholder":"PowerGym Beşiktaş","help":"Üyenin telefonda duyacağı spor salonu adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Üye İlişkileri Temsilcisi Adı","type":"text","required":true,"default":"Kemal","placeholder":"Kemal","help":"Üye ilişkileri temsilcisinin kendini tanıtacağı isim."},
  {"id":"OFFER_DETAILS","label":"Geri Dönüş Teklifi","type":"text","required":true,"placeholder":"3 ay üyelik %30 indirim + 2 kişisel antrenman seansı hediye","help":"Eski üyeyi geri kazanmak için sunulacak özel teklif. Cazip ve net olmalı; rakamlar ve hediyeler içermeli."},
  {"id":"CONTACT_PHONE","label":"Salon İletişim Numarası","type":"text","required":true,"placeholder":"0212 555 12 34","help":"Üyenin geri dönüş için sizi tekrar arayabilmesi için telefonda söylenecek salon numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'fitness-winback';

-- ŞABLON 8: education-enrollment
UPDATE assistant_templates SET fields = $F$[
  {"id":"INSTITUTION_NAME","label":"Kurum Adı","type":"text","required":true,"placeholder":"Yıldız Yabancı Dil Akademisi","help":"Öğrenci/velinin telefonda duyacağı eğitim kurumu adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Kayıt Danışmanı Adı","type":"text","required":true,"default":"Aylin","placeholder":"Aylin","help":"Kayıt danışmanının kendini tanıtacağı isim."},
  {"id":"PROGRAM_NAME","label":"Program / Kurs Adı","type":"text","required":true,"placeholder":"Yaz Yoğun İngilizce Programı","help":"Tanıtılacak programın adı. Müşterinin daha önce ilgi gösterdiği programa özel olarak ad verin."},
  {"id":"PROGRAM_START","label":"Program Başlangıç Tarihi","type":"text","required":true,"placeholder":"15 Temmuz","help":"Programın başlama tarihi. 'Bu programımız 15 Temmuz'da başlıyor' şeklinde söylenecektir."},
  {"id":"CONTACT_PHONE","label":"Kurum İletişim Numarası","type":"text","required":true,"placeholder":"0312 555 12 34","help":"Müşterinin kayıt için sizi tekrar arayabilmesi için telefonda söylenecek kurum numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'education-enrollment';

-- ŞABLON 9: auto-service-reminder
UPDATE assistant_templates SET fields = $F$[
  {"id":"SERVICE_NAME","label":"Servis Adı","type":"text","required":true,"placeholder":"Akın Yetkili Servis","help":"Müşterinin telefonda duyacağı oto servis adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Müşteri Temsilcisi Adı","type":"text","required":true,"default":"Hakan","placeholder":"Hakan","help":"Servis müşteri ilişkileri temsilcisinin kendini tanıtacağı isim."},
  {"id":"SERVICE_TYPE","label":"Servis Türü","type":"text","required":true,"default":"periyodik bakım","placeholder":"periyodik bakım","help":"Hatırlatılacak servis türü. Örnek değerler: 'periyodik bakım', 'lastik mevsim değişimi', 'fren bakımı', 'klima bakımı'."},
  {"id":"CONTACT_PHONE","label":"Servis İletişim Numarası","type":"text","required":true,"placeholder":"0312 555 12 34","help":"Müşterinin randevu için sizi tekrar arayabilmesi için telefonda söylenecek servis numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'auto-service-reminder';

-- ŞABLON 10: auto-testdrive-invite
UPDATE assistant_templates SET fields = $F$[
  {"id":"DEALER_NAME","label":"Yetkili Bayi / Galeri Adı","type":"text","required":true,"placeholder":"Premium Auto","help":"Müşterinin telefonda duyacağı bayi adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Satış Danışmanı Adı","type":"text","required":true,"default":"Cem","placeholder":"Cem","help":"Satış danışmanının kendini tanıtacağı isim."},
  {"id":"MODEL_NAME","label":"Davet Edilen Model","type":"text","required":true,"placeholder":"BMW iX 2026","help":"Test sürüşü için davet edilecek araç modeli. Yıl ve modeli birlikte yazın."},
  {"id":"CONTACT_PHONE","label":"Bayi İletişim Numarası","type":"text","required":true,"placeholder":"0212 555 12 34","help":"Müşterinin test sürüşü randevusu için sizi tekrar arayabilmesi için telefonda söylenecek bayi numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'auto-testdrive-invite';

-- ŞABLON 11: ecommerce-cart-recovery
UPDATE assistant_templates SET fields = $F$[
  {"id":"STORE_NAME","label":"Mağaza Adı","type":"text","required":true,"placeholder":"TrendShop","help":"Müşterinin telefonda duyacağı mağaza adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Müşteri Temsilcisi Adı","type":"text","required":true,"default":"Pelin","placeholder":"Pelin","help":"Müşteri ilişkileri temsilcisinin kendini tanıtacağı isim."},
  {"id":"DISCOUNT_CODE","label":"İndirim Kodu","type":"text","required":true,"default":"GERIDON10","placeholder":"GERIDON10","help":"Müşteriye sözlü olarak iletilen ve sepette geçerli olacak indirim kodu. Sade ve kolay söylenebilir olmalı."},
  {"id":"DISCOUNT_AMOUNT","label":"İndirim Oranı","type":"text","required":true,"default":"%10","placeholder":"%10","help":"İndirim kodunun değeri. '%10', '150 TL', 'Ücretsiz kargo' gibi formatlar uygundur."},
  {"id":"SUPPORT_PHONE","label":"Müşteri Hizmetleri Numarası","type":"text","required":true,"placeholder":"0212 555 12 34","help":"Müşterinin destek almak için sizi tekrar arayabilmesi için telefonda söylenecek müşteri hizmetleri numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'ecommerce-cart-recovery';

-- ŞABLON 12: ecommerce-review-nps
UPDATE assistant_templates SET fields = $F$[
  {"id":"STORE_NAME","label":"Mağaza Adı","type":"text","required":true,"placeholder":"TrendShop","help":"Müşterinin telefonda duyacağı mağaza adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Memnuniyet Uzmanı Adı","type":"text","required":true,"default":"Ezgi","placeholder":"Ezgi","help":"Memnuniyet anketi yapan uzmanın kendini tanıtacağı isim."}
]$F$::jsonb
WHERE slug = 'ecommerce-review-nps';

-- ŞABLON 13: insurance-policy-renewal
UPDATE assistant_templates SET fields = $F$[
  {"id":"AGENCY_NAME","label":"Acente Adı","type":"text","required":true,"placeholder":"Güven Sigorta Acentesi","help":"Sigortalının telefonda duyacağı acente adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Müşteri Temsilcisi Adı","type":"text","required":true,"default":"Levent","placeholder":"Levent","help":"Müşteri temsilcisinin kendini tanıtacağı isim."},
  {"id":"AGENT_PHONE","label":"Acente İletişim Numarası","type":"text","required":true,"placeholder":"0312 555 12 34","help":"Sigortalının yenileme detayları için sizi tekrar arayabilmesi için telefonda söylenecek acente numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'insurance-policy-renewal';

-- ŞABLON 14: payment-reminder
UPDATE assistant_templates SET fields = $F$[
  {"id":"COMPANY_NAME","label":"Firma Adı","type":"text","required":true,"placeholder":"ABC Hizmetleri","help":"Müşterinin telefonda duyacağı firma adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Müşteri Hizmetleri Temsilcisi Adı","type":"text","required":true,"default":"Selen","placeholder":"Selen","help":"Müşteri hizmetleri temsilcisinin kendini tanıtacağı isim."},
  {"id":"PAYMENT_METHODS","label":"Ödeme Kanalları","type":"text","required":true,"default":"web sitemiz, mobil uygulamamız veya anlaşmalı bankalar","placeholder":"web sitemiz, mobil uygulama veya bankalar","help":"Müşterinin ödeme yapabileceği kanalları kısaca listeler. Asistan 'Ödemenizi ... üzerinden yapabilirsiniz' diye söyler."},
  {"id":"CONTACT_PHONE","label":"Müşteri Hizmetleri Numarası","type":"text","required":true,"placeholder":"0312 555 12 34","help":"Müşterinin sorununu çözmek için sizi tekrar arayabilmesi için telefonda söylenecek müşteri hizmetleri numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'payment-reminder';

-- ŞABLON 15: logistics-delivery-info
UPDATE assistant_templates SET fields = $F$[
  {"id":"COMPANY_NAME","label":"Kargo Firma Adı","type":"text","required":true,"placeholder":"Hızlı Kargo","help":"Alıcının telefonda duyacağı kargo firması adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Teslimat Sorumlusu Adı","type":"text","required":true,"default":"Aslı","placeholder":"Aslı","help":"Teslimat bilgilendirme sorumlusunun kendini tanıtacağı isim."},
  {"id":"CONTACT_PHONE","label":"Kargo İletişim Numarası","type":"text","required":true,"placeholder":"444 12 34","help":"Alıcının teslimat detayları için sizi tekrar arayabilmesi için telefonda söylenecek müşteri hizmetleri numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'logistics-delivery-info';

-- ŞABLON 16: callcenter-nps
UPDATE assistant_templates SET fields = $F$[
  {"id":"COMPANY_NAME","label":"Firma Adı","type":"text","required":true,"placeholder":"ABC Firma","help":"Müşterinin telefonda duyacağı firma adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Memnuniyet Araştırmacısı Adı","type":"text","required":true,"default":"Nihal","placeholder":"Nihal","help":"Anket yapan kişinin kendini tanıtacağı isim."},
  {"id":"SERVICE_DESCRIPTION","label":"Anket Konusu","type":"text","required":true,"default":"hizmetimiz","placeholder":"teknik destek görüşmemiz","help":"Müşterinin geri bildirim vereceği hizmet/etkileşim. Örnek: 'teknik destek görüşmemiz', 'kargo deneyiminiz', 'müşteri hizmetleri çağrınız'."}
]$F$::jsonb
WHERE slug = 'callcenter-nps';

-- ŞABLON 17: beauty-appointment
UPDATE assistant_templates SET fields = $F$[
  {"id":"SALON_NAME","label":"Salon Adı","type":"text","required":true,"placeholder":"Glow Güzellik Salonu","help":"Müşterinin telefonda duyacağı salon adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Müşteri İlişkileri Uzmanı Adı","type":"text","required":true,"default":"Ezgi","placeholder":"Ezgi","help":"Müşteri ilişkileri uzmanının kendini tanıtacağı isim."},
  {"id":"CONTACT_PHONE","label":"Salon İletişim Numarası","type":"text","required":true,"placeholder":"0212 555 12 34","help":"Müşterinin randevu değişikliği için sizi tekrar arayabilmesi için telefonda söylenecek salon numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'beauty-appointment';

-- ŞABLON 18: generic-announcement
UPDATE assistant_templates SET fields = $F$[
  {"id":"COMPANY_NAME","label":"Firma / Kurum Adı","type":"text","required":true,"placeholder":"ABC Şirketi","help":"Müşterinin telefonda duyacağı firma adı."},
  {"id":"ASSISTANT_NAME","label":"Sanal Kurumsal İletişim Asistanı Adı","type":"text","required":true,"default":"Burak","placeholder":"Burak","help":"Duyuru yapan kurumsal iletişim asistanının kendini tanıtacağı isim."},
  {"id":"ANNOUNCEMENT_TITLE","label":"Duyuru Başlığı","type":"text","required":true,"placeholder":"Yeni mağaza açılışı","help":"Duyurunun kısa ve etkili başlığı. Müşteri ilgisini ilk saniyede çeken birkaç kelime."},
  {"id":"ANNOUNCEMENT_DETAILS","label":"Duyuru İçeriği","type":"textarea","required":true,"placeholder":"15 Haziran'da Kadıköy'de yeni mağazamızı açıyoruz. İlk 100 misafire özel %20 indirim ve hediye kartı vereceğiz.","help":"Duyurunun detayı. Ne, ne zaman, nerede, müşteri için fayda nedir. 2-3 cümle yeterli — uzun anlatım müşteri ilgisini kaybeder."},
  {"id":"ACTION_DETAILS","label":"İstenen Aksiyon (opsiyonel)","type":"text","placeholder":"web sitemizden detayları görebilirsiniz","help":"Müşteriden istenen şey (opsiyonel). Örnek: 'kayıt için web sitemizi ziyaret edin', 'açılışa davetlisiniz'. Boş bırakırsanız sadece bilgilendirme yapılır."},
  {"id":"CONTACT_PHONE","label":"Firma İletişim Numarası","type":"text","required":true,"placeholder":"0212 555 12 34","help":"Müşterinin daha fazla bilgi için sizi tekrar arayabilmesi için telefonda söylenecek firma numarası. Sistemin çıkış numarası değildir."}
]$F$::jsonb
WHERE slug = 'generic-announcement';

-- =====================================================
-- Bilgilendirme
-- =====================================================
DO $$
DECLARE
  total integer;
BEGIN
  SELECT count(*) INTO total FROM assistant_templates WHERE is_active = true;
  RAISE NOTICE '✅ Template fields polished. % active templates.', total;
END $$;
