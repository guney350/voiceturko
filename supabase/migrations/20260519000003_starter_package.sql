-- =====================================================
-- STARTER PACKAGE + 10₺ OVERAGE RATE
-- =====================================================
-- 1. Yeni "Başlangıç" paketi: 0 dakika @ 10₺/dakika
--    - Sadece rate belirler, dakika içermez
--    - Yeni user kayıt olunca otomatik aktive olur
--    - Kullanıcı kredi yükleyip bu paketten kullanır (10₺/dakika)
-- 2. deduct_balance fallback rate: 7₺ → 10₺
-- 3. Auth trigger: yeni user'a 10₺ kredi + Başlangıç paketi
-- =====================================================

-- =====================================================
-- 1. STARTER PAKETİ EKLE
-- =====================================================

INSERT INTO minute_packages (name, minutes, price_per_minute, display_order, is_active, is_featured, description)
VALUES (
  'Başlangıç',
  0,
  10.00,
  0,
  true,
  false,
  'Kullandıkça öde - 10₺/dakika. Kredi yükleyerek dilediğin kadar ara.'
)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 2. DEDUCT_BALANCE: FALLBACK RATE 7₺ → 10₺
-- =====================================================

CREATE OR REPLACE FUNCTION deduct_balance(
  p_user_id uuid,
  p_minutes numeric,
  p_call_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance user_balances;
  v_minutes_from_package integer := 0;
  v_minutes_from_credit numeric := 0;
  v_credit_cost numeric := 0;
  v_total_cost numeric := 0;
  v_credit_rate numeric := 10.00; -- ⬆ değişti: 7₺ → 10₺
  v_insufficient boolean := false;
BEGIN
  SELECT * INTO v_balance FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO user_balances (user_id) VALUES (p_user_id);
    SELECT * INTO v_balance FROM user_balances WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- Önce paket dakikadan düş (eğer varsa)
  IF v_balance.package_minutes_remaining > 0 THEN
    v_minutes_from_package := LEAST(v_balance.package_minutes_remaining, CEIL(p_minutes)::integer);
    v_total_cost := v_minutes_from_package * v_balance.package_rate_per_minute;
  END IF;

  -- Kalan dakika krediden düşülecek
  v_minutes_from_credit := p_minutes - v_minutes_from_package;
  IF v_minutes_from_credit > 0 THEN
    -- Eğer kullanıcının aktif bir paket rate'i varsa onu kullan, yoksa fallback (10₺)
    IF v_balance.package_rate_per_minute > 0 THEN
      v_credit_cost := v_minutes_from_credit * v_balance.package_rate_per_minute;
    ELSE
      v_credit_cost := v_minutes_from_credit * v_credit_rate;
    END IF;

    -- Yetersiz bakiye guard
    IF v_balance.credit_try < v_credit_cost THEN
      v_credit_cost := v_balance.credit_try;
      v_insufficient := true;
    END IF;

    v_total_cost := v_total_cost + v_credit_cost;
  END IF;

  -- Update balance (atomic)
  UPDATE user_balances SET
    package_minutes_remaining = GREATEST(0, package_minutes_remaining - v_minutes_from_package),
    credit_try = GREATEST(0, credit_try - v_credit_cost),
    total_minutes_used = total_minutes_used + CEIL(p_minutes)::integer,
    total_spent_try = total_spent_try + v_total_cost,
    updated_at = now()
  WHERE user_id = p_user_id;

  -- Credit transaction log
  IF v_credit_cost > 0 THEN
    INSERT INTO credit_transactions (user_id, amount, balance_after, transaction_type, reference_type, reference_id, description)
    VALUES (
      p_user_id,
      -v_credit_cost,
      (SELECT credit_try FROM user_balances WHERE user_id = p_user_id),
      'call_charge',
      'call',
      p_call_id,
      to_char(v_minutes_from_credit, 'FM999.99') || ' dk arama' ||
      CASE WHEN p_call_id IS NOT NULL THEN ' (' || p_call_id::text || ')' ELSE '' END
    );
  END IF;

  RETURN jsonb_build_object(
    'success', NOT v_insufficient,
    'insufficient_balance', v_insufficient,
    'minutes_from_package', v_minutes_from_package,
    'minutes_from_credit', v_minutes_from_credit,
    'package_cost', v_minutes_from_package * v_balance.package_rate_per_minute,
    'credit_cost', v_credit_cost,
    'total_cost', v_total_cost,
    'new_package_remaining', (SELECT package_minutes_remaining FROM user_balances WHERE user_id = p_user_id),
    'new_credit_balance', (SELECT credit_try FROM user_balances WHERE user_id = p_user_id)
  );
END;
$$;

-- =====================================================
-- 3. AUTH TRIGGER: YENİ USER'A KREDİ + BAŞLANGIÇ PAKETİ
-- =====================================================

CREATE OR REPLACE FUNCTION public.init_user_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_starter_package_id uuid;
BEGIN
  -- Starter paketi bul (10₺/dakika)
  SELECT id INTO v_starter_package_id
  FROM public.minute_packages
  WHERE name = 'Başlangıç' AND is_active = true
  ORDER BY display_order ASC
  LIMIT 1;

  -- 10₺ hoş geldin kredisi + Başlangıç paketi rate
  BEGIN
    INSERT INTO public.user_balances (
      user_id,
      credit_try,
      package_id,
      package_rate_per_minute,
      total_minutes_used,
      total_spent_try
    )
    VALUES (
      NEW.id,
      10.00,
      v_starter_package_id,
      10.00, -- 10₺/dakika rate (Başlangıç paketi)
      0,
      0
    )
    ON CONFLICT (user_id) DO NOTHING;

    -- Kredi transaction kaydı
    INSERT INTO public.credit_transactions (user_id, amount, balance_after, transaction_type, description)
    VALUES (NEW.id, 10.00, 10.00, 'trial_grant', 'Hoş geldin kredisi (10₺) + Başlangıç paketi aktif (10₺/dakika)');

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'init_user_balance failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.init_user_balance() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.init_user_balance() TO postgres;
GRANT EXECUTE ON FUNCTION public.init_user_balance() TO service_role;

-- =====================================================
-- 4. MEVCUT USER'LARA BAŞLANGIÇ PAKETİ AKTİVE ET
-- =====================================================
-- Henüz paketi olmayan user'lara Başlangıç paketi rate'ini ata

DO $$
DECLARE
  v_starter_package_id uuid;
BEGIN
  SELECT id INTO v_starter_package_id
  FROM minute_packages WHERE name = 'Başlangıç' AND is_active = true LIMIT 1;

  IF v_starter_package_id IS NOT NULL THEN
    UPDATE user_balances
    SET package_id = v_starter_package_id,
        package_rate_per_minute = 10.00
    WHERE package_id IS NULL OR package_rate_per_minute = 0;
  END IF;
END $$;

-- =====================================================
-- DONE
-- =====================================================
DO $$ BEGIN
  RAISE NOTICE '✅ Başlangıç paketi (10₺/dk) eklendi';
  RAISE NOTICE '💰 Overage rate: 7₺ → 10₺';
  RAISE NOTICE '🎁 Yeni user: 10₺ kredi + Başlangıç paketi otomatik';
END $$;
