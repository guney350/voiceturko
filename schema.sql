-- VoiceTurkoPortal Database Schema
-- Supabase PostgreSQL

-- ============================================
-- TABLES
-- ============================================

-- Plans Tablosu
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  included_minutes INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions Tablosu
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id),
  stripe_customer_id TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calls Tablosu
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  audio TEXT NOT NULL,
  transcript TEXT,
  analysis TEXT,
  duration_minutes DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usages Tablosu
CREATE TABLE usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  call_id UUID NOT NULL REFERENCES calls(id),
  cost DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assistant Tablosu
CREATE TABLE assistant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  first_message_mode TEXT NOT NULL CHECK (first_message_mode IN ('assistant', 'user')),
  first_message TEXT,
  system_prompt TEXT,
  voice_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SIPs Tablosu
CREATE TABLE sips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Minute Pricing Tablosu
CREATE TABLE minute_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_per_minute DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Minute Purchases Tablosu
CREATE TABLE minute_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  minutes_purchased INTEGER NOT NULL,
  price_per_minute DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  stripe_payment_id TEXT,
  purchased_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices Tablosu
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  invoice_number TEXT NOT NULL UNIQUE,
  stripe_invoice_id TEXT,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TRY',
  tax_amount DECIMAL(10,2),
  status TEXT NOT NULL CHECK (status IN ('paid', 'pending', 'failed', 'refunded')),
  invoice_date TIMESTAMPTZ NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  invoice_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys Tablosu
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs Tablosu
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES (Performans için)
-- ============================================

-- Subscriptions indeksleri
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Calls indeksleri
CREATE INDEX idx_calls_user_id ON calls(user_id);
CREATE INDEX idx_calls_subscription_id ON calls(subscription_id);

-- Usages indeksleri
CREATE INDEX idx_usages_user_id ON usages(user_id);
CREATE INDEX idx_usages_subscription_id ON usages(subscription_id);

-- Audit logs indeksleri
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Plans tablosu (herkes okuyabilir, sadece admin yazabilir)
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans are viewable by everyone" ON plans FOR SELECT USING (true);

-- Subscriptions (kullanıcılar sadece kendi aboneliklerini görebilir)
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscriptions" ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Calls (kullanıcılar sadece kendi çağrılarını görebilir)
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own calls" ON calls FOR SELECT USING (auth.uid() = user_id);

-- Usages (kullanıcılar sadece kendi kullanımlarını görebilir)
ALTER TABLE usages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own usages" ON usages FOR SELECT USING (auth.uid() = user_id);

-- Assistant (kullanıcılar sadece kendi asistanlarını görebilir/düzenleyebilir)
ALTER TABLE assistant ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own assistant" ON assistant FOR ALL USING (auth.uid() = user_id);

-- SIPs (kullanıcılar sadece kendi SIP'lerini görebilir/düzenleyebilir)
ALTER TABLE sips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own sips" ON sips FOR ALL USING (auth.uid() = user_id);

-- Minute purchases (kullanıcılar sadece kendi alımlarını görebilir)
ALTER TABLE minute_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own minute purchases" ON minute_purchases FOR SELECT USING (auth.uid() = user_id);

-- Invoices (kullanıcılar sadece kendi faturalarını görebilir)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own invoices" ON invoices FOR SELECT USING (auth.uid() = user_id);

-- API Keys (kullanıcılar sadece kendi key'lerini görebilir/düzenleyebilir)
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own api keys" ON api_keys FOR ALL USING (auth.uid() = user_id);

-- Audit logs (kullanıcılar sadece kendi loglarını görebilir)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own audit logs" ON audit_logs FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- INITIAL DATA (Opsiyonel)
-- ============================================

-- Varsayılan dakika fiyatlandırması
INSERT INTO minute_pricing (price_per_minute, currency, is_active) 
VALUES (10.00, 'TRY', true);

-- Örnek planlar
INSERT INTO plans (name, price, currency, included_minutes, is_active) VALUES
('Başlangıç', 500.00, 'TRY', 1000, true),
('Profesyonel', 1000.00, 'TRY', 3000, true),
('Kurumsal', 2500.00, 'TRY', 10000, true);