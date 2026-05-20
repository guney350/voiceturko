-- =====================================================
-- CRITICAL ENTERPRISE FIXES
-- =====================================================
-- C1: RLS policies sıkılaştır (service_role only)
-- C4: deduct_balance insufficient balance check
-- C8: Pool atomic increment (capacity check)
-- C11: Pool assignment unique constraint
-- H10: Campaign counters atomic
-- =====================================================

-- =====================================================
-- C1: RLS - service_role only policies (Critical Security)
-- =====================================================

-- user_balances: drop overly permissive, only SELECT own
DROP POLICY IF EXISTS "balances_service_role" ON user_balances;
-- user_balances'ta sadece SELECT own kalsın (zaten var)
-- Service role RLS bypass eder, ayrıca policy gerekmez

-- package_purchases: drop overly permissive
DROP POLICY IF EXISTS "package_purchases_service_role" ON package_purchases;

-- credit_transactions: drop overly permissive
DROP POLICY IF EXISTS "credit_transactions_service_role" ON credit_transactions;

-- payment_intents: drop overly permissive
DROP POLICY IF EXISTS "payment_intents_service_role" ON payment_intents;

-- key_rotation_logs: drop overly permissive, admin-only
DROP POLICY IF EXISTS "key_rotation_service_role" ON key_rotation_logs;
-- Bu tablo sadece service_role tarafından okunur (RLS bypass)

-- user_pool_assignments: drop overly permissive
DROP POLICY IF EXISTS "user_pool_service_role_all" ON user_pool_assignments;

-- =====================================================
-- C4: deduct_balance insufficient balance guard
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

    -- YETERSIZ BAKIYE KONTROLÜ
    IF v_balance.credit_try < v_credit_cost THEN
      -- Mevcut kredi kadar düş, geri kalanı borç olarak işaretle
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
      format('%.2f dk arama (%s)', v_minutes_from_credit, COALESCE(p_call_id::text, 'unknown'))
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
-- C8: Pool atomic increment with capacity check
-- =====================================================
-- ÖNEMLİ: Return type değiştiği için önce DROP gerekiyor
DROP FUNCTION IF EXISTS increment_active_calls(uuid);
DROP FUNCTION IF EXISTS decrement_active_calls(uuid);

CREATE FUNCTION increment_active_calls(account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_count integer;
BEGIN
  UPDATE vapi_accounts
  SET current_active_calls = current_active_calls + 1,
      total_calls_made = total_calls_made + 1,
      last_used_at = now()
  WHERE id = account_id
    AND is_active = true
    AND status IN ('active', 'standby')
    AND current_active_calls < max_concurrent_calls
  RETURNING current_active_calls INTO v_new_count;

  IF v_new_count IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'CAPACITY_FULL_OR_INACTIVE');
  END IF;

  RETURN jsonb_build_object('success', true, 'current_active_calls', v_new_count);
END;
$$;

CREATE FUNCTION decrement_active_calls(account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_count integer;
BEGIN
  UPDATE vapi_accounts
  SET current_active_calls = GREATEST(0, current_active_calls - 1)
  WHERE id = account_id
  RETURNING current_active_calls INTO v_new_count;

  RETURN jsonb_build_object('success', true, 'current_active_calls', COALESCE(v_new_count, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION increment_active_calls(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION decrement_active_calls(uuid) TO service_role;

-- =====================================================
-- C11: Pool assignment unique constraint
-- =====================================================
-- Aynı vapi_account_id'nin birden fazla aktif assignment'ı olamaz
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_pool_assignment
  ON user_pool_assignments(vapi_account_id)
  WHERE is_active = true;

-- =====================================================
-- H10: Campaign counter atomic update RPC
-- =====================================================

CREATE OR REPLACE FUNCTION update_campaign_counters(
  p_campaign_id uuid,
  p_completed_delta integer DEFAULT 0,
  p_successful_delta integer DEFAULT 0,
  p_failed_delta integer DEFAULT 0,
  p_pending_delta integer DEFAULT 0,
  p_active_delta integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  UPDATE campaigns SET
    completed_calls = GREATEST(0, COALESCE(completed_calls, 0) + p_completed_delta),
    successful_calls = GREATEST(0, COALESCE(successful_calls, 0) + p_successful_delta),
    failed_calls = GREATEST(0, COALESCE(failed_calls, 0) + p_failed_delta),
    pending_calls = GREATEST(0, COALESCE(pending_calls, 0) + p_pending_delta),
    active_call_count = GREATEST(0, COALESCE(active_call_count, 0) + p_active_delta)
  WHERE id = p_campaign_id
  RETURNING jsonb_build_object(
    'completed', completed_calls,
    'successful', successful_calls,
    'failed', failed_calls,
    'pending', pending_calls,
    'active', active_call_count
  ) INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION update_campaign_counters(uuid, integer, integer, integer, integer, integer) TO service_role;

-- =====================================================
-- H10: Idempotent webhook claim
-- =====================================================
-- completeCall'da kullanılır: aynı call için sadece 1 kez işlem yapılır
CREATE OR REPLACE FUNCTION claim_call_webhook(p_vapi_call_id text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_call_id uuid;
BEGIN
  -- Sadece henüz işlenmemiş call'ı claim et
  UPDATE calls
  SET webhook_processed_at = now()
  WHERE vapi_call_id = p_vapi_call_id
    AND webhook_processed_at IS NULL
  RETURNING id INTO v_call_id;

  IF v_call_id IS NULL THEN
    -- Ya kayıt yok ya da zaten işlenmiş
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_processed_or_not_found');
  END IF;

  RETURN jsonb_build_object('claimed', true, 'call_id', v_call_id);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_call_webhook(text) TO service_role;

-- =====================================================
-- DONE
-- =====================================================
DO $$ BEGIN
  RAISE NOTICE '✅ Critical Enterprise Fixes Tamamlandı';
  RAISE NOTICE '🔒 RLS policies sıkılaştırıldı';
  RAISE NOTICE '💰 deduct_balance: yetersiz bakiye guard eklendi';
  RAISE NOTICE '🔑 Pool atomic increment: capacity check ile';
  RAISE NOTICE '📊 Campaign counters: atomic RPC';
  RAISE NOTICE '🛡️ Webhook claim: race condition önlendi';
END $$;
