-- =====================================================
-- Hoş geldin kredisi: 10₺ → 500₺
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
      500.00,
      v_starter_package_id,
      10.00,
      0,
      0
    )
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.credit_transactions (user_id, amount, balance_after, transaction_type, description)
    VALUES (NEW.id, 500.00, 500.00, 'trial_grant', 'Hoş geldin kredisi (500₺)');

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'init_user_balance failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.init_user_balance() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.init_user_balance() TO postgres;
GRANT EXECUTE ON FUNCTION public.init_user_balance() TO service_role;
