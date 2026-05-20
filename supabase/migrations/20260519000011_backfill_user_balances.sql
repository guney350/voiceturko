-- =====================================================
-- BACKFILL: Mevcut tüm kullanıcılara user_balances kaydı oluştur
-- =====================================================
-- Eski kullanıcılarda (auth trigger'dan önce kayıt olmuş) user_balances yok.
-- Hepsine "Başlangıç" paketini (0 dk, 10₺/dk) ata + 0₺ kredi ile başlat.
-- Yeni trigger zaten yeni kullanıcılara bunu otomatik yapıyor; bu sadece backfill.
-- =====================================================

DO $$
DECLARE
  v_user record;
  v_starter_id uuid;
  v_count integer := 0;
BEGIN
  -- Başlangıç paketini bul
  SELECT id INTO v_starter_id
  FROM minute_packages
  WHERE minutes = 0 AND price_per_minute = 10.00 AND is_active = true
  ORDER BY display_order
  LIMIT 1;

  IF v_starter_id IS NULL THEN
    RAISE NOTICE 'Başlangıç paketi bulunamadı, backfill atlandı.';
    RETURN;
  END IF;

  -- user_balances'i olmayan tüm kullanıcılar için kayıt oluştur
  FOR v_user IN
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN user_balances ub ON ub.user_id = au.id
    WHERE ub.user_id IS NULL
  LOOP
    BEGIN
      INSERT INTO user_balances (
        user_id,
        package_id,
        package_minutes_remaining,
        package_total_minutes,
        package_rate_per_minute,
        credit_try,
        total_minutes_used,
        total_spent_try,
        package_purchased_at
      ) VALUES (
        v_user.id,
        v_starter_id,
        0,         -- Başlangıç paketinde 0 dakika
        0,
        10.00,     -- 10₺/dk fallback
        0,         -- Kredi 0 (admin elle ekleyebilir)
        0,
        0,
        now()
      );
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Backfill hatası (%): %', v_user.email, SQLERRM;
    END;
  END LOOP;

  -- Mevcut user_balances'i olan ama package_id NULL olanlar için de güncelle
  UPDATE user_balances
  SET
    package_id = v_starter_id,
    package_rate_per_minute = 10.00,
    package_purchased_at = COALESCE(package_purchased_at, now())
  WHERE package_id IS NULL;

  RAISE NOTICE '✅ Backfill tamamlandı: % yeni user_balances kaydı oluşturuldu.', v_count;
END $$;

-- Bilgilendirme
DO $$
DECLARE
  total_users integer;
  with_balances integer;
  with_package integer;
BEGIN
  SELECT count(*) INTO total_users FROM auth.users;
  SELECT count(*) INTO with_balances FROM user_balances;
  SELECT count(*) INTO with_package FROM user_balances WHERE package_id IS NOT NULL;

  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE 'Auth users: %', total_users;
  RAISE NOTICE 'user_balances kaydı olan: %', with_balances;
  RAISE NOTICE 'Aktif paketi olan: %', with_package;
  RAISE NOTICE '═══════════════════════════════════════════';
END $$;
