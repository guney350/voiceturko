-- ============================================================
-- KRITIK FIX: deduct_balance idempotent (cift dusum bug)
-- ============================================================
-- Sorun: Webhook ve polling ayni call icin RPC'yi 2 kez cagiriyor.
--        deduct_balance idempotent olmadigi icin bakiye 2 kat dusuyor.
-- Cozum: calls tablosuna billing_processed_at kolonu + RPC bunu kontrol etsin
-- ============================================================

-- 1) calls tablosuna billing_processed_at ekle (idempotency marker)
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS billing_processed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_calls_billing_processed
  ON calls(id, billing_processed_at) WHERE billing_processed_at IS NULL;

-- 2) deduct_balance: p_call_id geldiyse, calls.billing_processed_at kontrol et
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
  v_already_billed boolean := false;
BEGIN
  -- IDEMPOTENCY: Bu call icin daha once dusum yapilmis mi?
  IF p_call_id IS NOT NULL THEN
    SELECT (billing_processed_at IS NOT NULL) INTO v_already_billed
    FROM calls WHERE id = p_call_id FOR UPDATE;

    IF v_already_billed THEN
      -- Zaten islenmis - skip, dummy result don
      RETURN jsonb_build_object(
        'success', true,
        'already_processed', true,
        'minutes_from_package', 0,
        'minutes_from_credit', 0,
        'package_cost', 0,
        'credit_cost', 0,
        'total_cost', 0
      );
    END IF;
  END IF;

  -- User balance kilitle
  SELECT * INTO v_balance FROM user_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO user_balances (user_id) VALUES (p_user_id);
    SELECT * INTO v_balance FROM user_balances WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  -- Once paket dakikadan dus
  IF v_balance.package_minutes_remaining > 0 THEN
    v_minutes_from_package := LEAST(v_balance.package_minutes_remaining, CEIL(p_minutes)::integer);
    v_total_cost := v_minutes_from_package * v_balance.package_rate_per_minute;
  END IF;

  -- Kalan dakika krediden dusulecek
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

  -- Credit transaction log (sadece kredi dusumu varsa)
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

  -- IDEMPOTENCY MARKER: bu call'i islenmis isaretle
  IF p_call_id IS NOT NULL THEN
    UPDATE calls SET billing_processed_at = now() WHERE id = p_call_id;
  END IF;

  RETURN jsonb_build_object(
    'success', NOT v_insufficient,
    'insufficient_balance', v_insufficient,
    'already_processed', false,
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

DO $$ BEGIN
  RAISE NOTICE 'deduct_balance idempotent hale getirildi (calls.billing_processed_at marker)';
END $$;
