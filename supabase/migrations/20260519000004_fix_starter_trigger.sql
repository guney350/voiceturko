-- =====================================================
-- Trigger fix: Başlangıç paketini SADECE display_order=0 + minutes=0 ile bul
-- (Adı eşleşmediği için yanlış paket atayan eski versiyon güvensiz)
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
  -- Başlangıç paketini güvenli şekilde bul: 0 dakika @ 10₺ olan
  SELECT id INTO v_starter_package_id
  FROM public.minute_packages
  WHERE minutes = 0 AND price_per_minute = 10.00 AND is_active = true
  ORDER BY display_order ASC
  LIMIT 1;

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
      10.00,
      0,
      0
    )
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.credit_transactions (user_id, amount, balance_after, transaction_type, description)
    VALUES (NEW.id, 10.00, 10.00, 'trial_grant', 'Hoş geldin kredisi (10₺) + Başlangıç paketi aktif');

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'init_user_balance failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.init_user_balance() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.init_user_balance() TO postgres;
GRANT EXECUTE ON FUNCTION public.init_user_balance() TO service_role;

DO $$ BEGIN
  RAISE NOTICE '✅ Trigger düzeltildi: artık minutes=0 + price=10 olan paketi seçer';
END $$;
