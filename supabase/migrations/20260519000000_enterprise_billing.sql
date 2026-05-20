-- =====================================================
-- ENTERPRISE BILLING SYSTEM
-- =====================================================
-- 1. minute_packages: Tier paketleri (10K dk@7₺, 30K@5₺, vb.)
-- 2. user_balances: Her user'ın paket_dakika + kredi_TL bakiyesi
-- 3. package_purchases: Paket alım kayıtları
-- 4. credit_transactions: Kredi yükleme/düşme ledger
-- 5. payment_intents: Stripe + Oxapay ödeme tracking
-- 6. vapi_accounts.spending_limit default 9.50 ($10 - margin)
-- 7. Key rotation logs
-- =====================================================

-- =====================================================
-- 1. MINUTE_PACKAGES (Tier'lar)
-- =====================================================

CREATE TABLE IF NOT EXISTS minute_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  minutes integer NOT NULL,
  price_per_minute numeric(10, 2) NOT NULL,
  total_price numeric(12, 2) GENERATED ALWAYS AS (minutes * price_per_minute) STORED,
  currency text DEFAULT 'TRY',
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_minute_packages_active
  ON minute_packages(is_active, display_order) WHERE is_active = true;

-- Default 4 paket
INSERT INTO minute_packages (name, minutes, price_per_minute, display_order, is_featured, description)
VALUES
  ('Başlangıç', 10000, 7.00, 1, false, '10.000 dakika - küçük ekipler için ideal'),
  ('Popüler', 30000, 5.00, 2, true, '30.000 dakika - en çok tercih edilen paket'),
  ('Profesyonel', 50000, 4.00, 3, false, '50.000 dakika - büyük kampanyalar için'),
  ('Kurumsal', 100000, 3.00, 4, false, '100.000 dakika - sınırsız kullanım deneyimi')
ON CONFLICT DO NOTHING;

ALTER TABLE minute_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "packages_read_all" ON minute_packages
  FOR SELECT USING (true);

-- =====================================================
-- 2. USER_BALANCES
-- =====================================================

CREATE TABLE IF NOT EXISTS user_balances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Paket bakiyesi
  package_minutes_remaining integer DEFAULT 0,
  package_total_minutes integer DEFAULT 0,
  package_rate_per_minute numeric(10, 2) DEFAULT 0,
  package_purchased_at timestamptz,
  package_id uuid REFERENCES minute_packages(id),
  -- Kredi bakiyesi (TL)
  credit_try numeric(12, 2) DEFAULT 0,
  -- Total kullanım (istatistik)
  total_minutes_used integer DEFAULT 0,
  total_spent_try numeric(12, 2) DEFAULT 0,
  -- Meta
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_balances_credit
  ON user_balances(credit_try) WHERE credit_try > 0;

ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "balances_own" ON user_balances
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "balances_service_role" ON user_balances
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 3. PACKAGE_PURCHASES
-- =====================================================

CREATE TABLE IF NOT EXISTS package_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id uuid REFERENCES minute_packages(id),
  minutes integer NOT NULL,
  price_per_minute numeric(10, 2) NOT NULL,
  total_price numeric(12, 2) NOT NULL,
  currency text DEFAULT 'TRY',
  payment_method text CHECK (payment_method IN ('stripe', 'oxapay', 'manual', 'admin_grant', 'trial')),
  payment_id text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_package_purchases_user
  ON package_purchases(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_package_purchases_status
  ON package_purchases(status, created_at);

ALTER TABLE package_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "package_purchases_own" ON package_purchases
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "package_purchases_service_role" ON package_purchases
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 4. CREDIT_TRANSACTIONS (Ledger)
-- =====================================================

CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12, 2) NOT NULL, -- pozitif: yükleme, negatif: kullanım
  balance_after numeric(12, 2) NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('topup', 'call_charge', 'refund', 'trial_grant', 'admin_grant', 'admin_deduct', 'package_overflow')),
  reference_type text, -- 'call', 'package_purchase', 'payment'
  reference_id uuid,
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user
  ON credit_transactions(user_id, created_at DESC);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_transactions_own" ON credit_transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "credit_transactions_service_role" ON credit_transactions
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 5. PAYMENT_INTENTS (Stripe + Oxapay tracking)
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'oxapay')),
  provider_intent_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('package', 'credit_topup')),
  package_id uuid REFERENCES minute_packages(id),
  amount numeric(12, 2) NOT NULL,
  currency text DEFAULT 'TRY',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired', 'cancelled')),
  metadata jsonb DEFAULT '{}',
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(provider, provider_intent_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_user
  ON payment_intents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status
  ON payment_intents(status, created_at);

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_intents_own" ON payment_intents
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "payment_intents_service_role" ON payment_intents
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 6. VAPI_ACCOUNTS: SPENDING LIMIT DEFAULT
-- =====================================================
-- Mevcut spending_limit'i 9.50'ye sabitle (margin için)
UPDATE vapi_accounts SET spending_limit = 9.50 WHERE spending_limit IS NULL OR spending_limit = 0;
ALTER TABLE vapi_accounts ALTER COLUMN spending_limit SET DEFAULT 9.50;

-- =====================================================
-- 7. KEY ROTATION LOGS
-- =====================================================

CREATE TABLE IF NOT EXISTS key_rotation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  old_account_id uuid REFERENCES vapi_accounts(id) ON DELETE SET NULL,
  new_account_id uuid REFERENCES vapi_accounts(id) ON DELETE SET NULL,
  reason text NOT NULL,
  old_spent numeric(10, 2),
  resources_replicated integer DEFAULT 0,
  success boolean DEFAULT false,
  error_message text,
  rotated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_key_rotation_user
  ON key_rotation_logs(user_id, rotated_at DESC);

ALTER TABLE key_rotation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "key_rotation_service_role" ON key_rotation_logs
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 8. AUTH TRIGGER: HOŞ GELDİN KREDİSİ + USER_BALANCES INIT
-- =====================================================

CREATE OR REPLACE FUNCTION public.init_user_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 10₺ hoş geldin kredisi
  INSERT INTO public.user_balances (user_id, credit_try, total_minutes_used, total_spent_try)
  VALUES (NEW.id, 10.00, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Kredi transaction kaydı
  INSERT INTO public.credit_transactions (user_id, amount, balance_after, transaction_type, description)
  VALUES (NEW.id, 10.00, 10.00, 'trial_grant', 'Hoş geldin kredisi (10₺)');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'init_user_balance failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_created_init_balance ON auth.users;
CREATE TRIGGER on_user_created_init_balance
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.init_user_balance();

GRANT EXECUTE ON FUNCTION public.init_user_balance() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.init_user_balance() TO postgres;
GRANT EXECUTE ON FUNCTION public.init_user_balance() TO service_role;

-- =====================================================
-- 9. BACKFILL: MEVCUT USER'LARA BALANCE OLUŞTUR
-- =====================================================

DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN
    SELECT id FROM auth.users
    WHERE id NOT IN (SELECT user_id FROM user_balances)
  LOOP
    INSERT INTO user_balances (user_id, credit_try)
    VALUES (u.id, 10.00)
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO credit_transactions (user_id, amount, balance_after, transaction_type, description)
    VALUES (u.id, 10.00, 10.00, 'trial_grant', 'Hoş geldin kredisi (mevcut user - backfill)');
  END LOOP;
END $$;

-- =====================================================
-- 10. RPC FONKSİYONLARI: BALANCE OPERATIONS
-- =====================================================

-- Atomic kredi düşme
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
  v_credit_rate numeric := 7.00; -- paket bitince fallback fiyat
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

  -- Kalan dakikayı krediden düş
  v_minutes_from_credit := p_minutes - v_minutes_from_package;
  IF v_minutes_from_credit > 0 THEN
    v_credit_cost := v_minutes_from_credit * v_credit_rate;
    v_total_cost := v_total_cost + v_credit_cost;
  END IF;

  -- Update balance
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
      format('%.2f dk arama (%s)', v_minutes_from_credit, p_call_id)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
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

-- Atomic kredi yükleme
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
    COALESCE(p_description, format('Kredi yüklemesi: %.2f₺', p_amount))
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION topup_credit(uuid, numeric, text, uuid, text) TO service_role;

-- Paket aktive etme
CREATE OR REPLACE FUNCTION activate_package(
  p_user_id uuid,
  p_package_id uuid,
  p_payment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_package minute_packages;
BEGIN
  SELECT * INTO v_package FROM minute_packages WHERE id = p_package_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Paket bulunamadı');
  END IF;

  INSERT INTO user_balances (user_id, package_id, package_minutes_remaining, package_total_minutes, package_rate_per_minute, package_purchased_at)
  VALUES (p_user_id, p_package_id, v_package.minutes, v_package.minutes, v_package.price_per_minute, now())
  ON CONFLICT (user_id) DO UPDATE SET
    package_id = p_package_id,
    package_minutes_remaining = user_balances.package_minutes_remaining + v_package.minutes,
    package_total_minutes = user_balances.package_total_minutes + v_package.minutes,
    package_rate_per_minute = v_package.price_per_minute,
    package_purchased_at = now(),
    updated_at = now();

  -- Package purchase log
  INSERT INTO package_purchases (user_id, package_id, minutes, price_per_minute, total_price, payment_id, status, completed_at)
  VALUES (p_user_id, p_package_id, v_package.minutes, v_package.price_per_minute, v_package.total_price,
          COALESCE(p_payment_id::text, NULL), 'completed', now());

  RETURN jsonb_build_object(
    'success', true,
    'package_minutes', v_package.minutes,
    'price_per_minute', v_package.price_per_minute,
    'total_price', v_package.total_price
  );
END;
$$;

GRANT EXECUTE ON FUNCTION activate_package(uuid, uuid, uuid) TO service_role;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

DO $$
DECLARE
  total_packages integer;
  total_balances integer;
BEGIN
  SELECT COUNT(*) INTO total_packages FROM minute_packages WHERE is_active = true;
  SELECT COUNT(*) INTO total_balances FROM user_balances;

  RAISE NOTICE '✅ Enterprise Billing Migration Tamamlandı';
  RAISE NOTICE '📦 Aktif paket: %', total_packages;
  RAISE NOTICE '💰 User balance: %', total_balances;
  RAISE NOTICE '🎁 Default: 10₺ hoş geldin kredisi her yeni user için';
END $$;
