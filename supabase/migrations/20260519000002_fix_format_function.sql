-- =====================================================
-- FIX: deduct_balance format() error
-- =====================================================
-- PostgreSQL format() fonksiyonu %f, %.2f gibi printf specifier'lar desteklemiyor
-- to_char ile değiştir
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
  v_credit_rate numeric := 7.00;
  v_insufficient boolean := false;
BEGIN
  -- User balance kilitle
  SELECT * INTO v_balance FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO user_balances (user_id) VALUES (p_user_id);
    SELECT * INTO v_balance FROM user_balances WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- Önce paket dakikadan düş
  IF v_balance.package_minutes_remaining > 0 THEN
    v_minutes_from_package := LEAST(v_balance.package_minutes_remaining, CEIL(p_minutes)::integer);
    v_total_cost := v_minutes_from_package * v_balance.package_rate_per_minute;
  END IF;

  -- Kalan dakika krediden düşülecek
  v_minutes_from_credit := p_minutes - v_minutes_from_package;
  IF v_minutes_from_credit > 0 THEN
    v_credit_cost := v_minutes_from_credit * v_credit_rate;

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

  -- Credit transaction log (format() yerine to_char + concat)
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

GRANT EXECUTE ON FUNCTION deduct_balance(uuid, numeric, uuid) TO service_role;

-- Aynı format() hatası topup_credit'te de var, düzelt
CREATE OR REPLACE FUNCTION topup_credit(
  p_user_id uuid,
  p_amount numeric,
  p_transaction_type text DEFAULT 'topup',
  p_reference_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  INSERT INTO user_balances (user_id, credit_try)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE SET
    credit_try = user_balances.credit_try + p_amount,
    updated_at = now()
  RETURNING credit_try INTO v_new_balance;

  INSERT INTO credit_transactions (user_id, amount, balance_after, transaction_type, reference_id, description)
  VALUES (
    p_user_id,
    p_amount,
    v_new_balance,
    p_transaction_type,
    p_reference_id,
    COALESCE(p_description, 'Kredi yüklemesi: ' || to_char(p_amount, 'FM999999.00') || '₺')
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION topup_credit(uuid, numeric, text, uuid, text) TO service_role;

DO $$ BEGIN
  RAISE NOTICE '✅ format() hatası düzeltildi';
END $$;
