-- =====================================================
-- VAPI COMPLETE SYSTEM - MAIN MIGRATION
-- =====================================================
-- Bu migration tüm VAPI sistemini kurar
-- Kampanya yönetimi, VAPI hesap yönetimi, webhook sistemi
-- =====================================================

-- =====================================================
-- 1. VAPI ACCOUNTS (Çoklu VAPI Hesap Yönetimi)
-- =====================================================

CREATE TABLE IF NOT EXISTS vapi_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  
  -- Bakiye Yönetimi
  initial_balance DECIMAL(10,2) DEFAULT 0,
  current_balance DECIMAL(10,2) DEFAULT 0,
  min_balance_threshold DECIMAL(10,2) DEFAULT 5.00,
  
  -- İstatistikler
  total_spent DECIMAL(10,2) DEFAULT 0,
  total_calls_made INTEGER DEFAULT 0,
  
  -- Durum
  status TEXT DEFAULT 'standby' CHECK (status IN ('active', 'standby', 'exhausted', 'low_balance', 'error')),
  is_current BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  
  -- Hata Yönetimi
  error_count INTEGER DEFAULT 0,
  error_message TEXT,
  last_error_at TIMESTAMPTZ,
  
  -- Zaman Damgaları
  last_used_at TIMESTAMPTZ,
  last_balance_check TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_vapi_accounts_user ON vapi_accounts(user_id);
CREATE INDEX idx_vapi_accounts_current ON vapi_accounts(user_id, is_current) WHERE is_current = true;
CREATE INDEX idx_vapi_accounts_status ON vapi_accounts(status);

-- RLS Policies
ALTER TABLE vapi_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own VAPI accounts"
  ON vapi_accounts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own VAPI accounts"
  ON vapi_accounts FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own VAPI accounts"
  ON vapi_accounts FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own VAPI accounts"
  ON vapi_accounts FOR DELETE
  USING (user_id = auth.uid());

-- =====================================================
-- 2. VAPI BALANCE LOGS (Bakiye Değişim Logları)
-- =====================================================

CREATE TABLE IF NOT EXISTS vapi_balance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES vapi_accounts(id) ON DELETE CASCADE,
  balance DECIMAL(10,2) NOT NULL,
  balance_change DECIMAL(10,2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vapi_balance_logs_account ON vapi_balance_logs(account_id);
CREATE INDEX idx_vapi_balance_logs_created ON vapi_balance_logs(created_at DESC);

ALTER TABLE vapi_balance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their account balance logs"
  ON vapi_balance_logs FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM vapi_accounts WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- 3. VAPI ACCOUNT SWITCH LOGS (Hesap Değişim Logları)
-- =====================================================

CREATE TABLE IF NOT EXISTS vapi_account_switch_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_account_id UUID REFERENCES vapi_accounts(id) ON DELETE SET NULL,
  to_account_id UUID REFERENCES vapi_accounts(id) ON DELETE SET NULL,
  switch_reason TEXT NOT NULL,
  from_balance DECIMAL(10,2),
  to_balance DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vapi_switch_logs_user ON vapi_account_switch_logs(user_id);
CREATE INDEX idx_vapi_switch_logs_created ON vapi_account_switch_logs(created_at DESC);

ALTER TABLE vapi_account_switch_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own switch logs"
  ON vapi_account_switch_logs FOR SELECT
  USING (user_id = auth.uid());

-- =====================================================
-- 4. VAPI PHONE NUMBERS (Telefon Numaraları)
-- =====================================================

CREATE TABLE IF NOT EXISTS vapi_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_account_id UUID NOT NULL REFERENCES vapi_accounts(id) ON DELETE CASCADE,
  vapi_phone_number_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  provider TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(vapi_account_id, vapi_phone_number_id)
);

CREATE INDEX idx_vapi_phone_numbers_account ON vapi_phone_numbers(vapi_account_id);
CREATE INDEX idx_vapi_phone_numbers_active ON vapi_phone_numbers(is_active) WHERE is_active = true;

ALTER TABLE vapi_phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view phone numbers of their accounts"
  ON vapi_phone_numbers FOR SELECT
  USING (
    vapi_account_id IN (
      SELECT id FROM vapi_accounts WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- 5. CAMPAIGNS (Kampanya Yönetimi)
-- =====================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  assistant_id UUID REFERENCES assistant(id) ON DELETE SET NULL,
  
  -- Durum
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'cancelled')),
  
  -- İstatistikler
  total_calls INTEGER DEFAULT 0,
  completed_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  pending_calls INTEGER DEFAULT 0,
  active_call_count INTEGER DEFAULT 0,
  
  -- Ayarlar
  max_concurrent_calls INTEGER DEFAULT 10,
  
  -- Worker Yönetimi
  worker_id TEXT,
  last_heartbeat_at TIMESTAMPTZ,
  
  -- Zaman Damgaları
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  pause_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaigns_user ON campaigns(user_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_running ON campaigns(status) WHERE status = 'running';

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own campaigns"
  ON campaigns FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own campaigns"
  ON campaigns FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own campaigns"
  ON campaigns FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own campaigns"
  ON campaigns FOR DELETE
  USING (user_id = auth.uid());

-- =====================================================
-- 6. CAMPAIGN ITEMS (Kampanya Kişileri)
-- =====================================================

CREATE TABLE IF NOT EXISTS campaign_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Kişi Bilgileri
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_gender TEXT,
  
  -- Arama Sırası
  call_order INTEGER NOT NULL,
  
  -- Durum
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'locked', 'calling', 'completed', 'failed', 'cancelled', 'retry_wait')),
  
  -- VAPI Call ID
  vapi_call_id TEXT,
  
  -- Kilit Yönetimi
  locked_at TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,
  worker_id TEXT,
  
  -- Retry Yönetimi
  attempt_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  
  -- Arama Bilgileri
  called_at TIMESTAMPTZ,
  call_started_at TIMESTAMPTZ,
  call_timeout_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  call_duration INTEGER,
  error_message TEXT,
  
  -- Takılma Sayacı
  stall_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaign_items_campaign ON campaign_items(campaign_id);
CREATE INDEX idx_campaign_items_status ON campaign_items(status);
CREATE INDEX idx_campaign_items_order ON campaign_items(campaign_id, call_order);
CREATE INDEX idx_campaign_items_pending ON campaign_items(campaign_id, status) WHERE status IN ('pending', 'retry_wait');
CREATE INDEX idx_campaign_items_vapi_call ON campaign_items(vapi_call_id) WHERE vapi_call_id IS NOT NULL;

ALTER TABLE campaign_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items of their campaigns"
  ON campaign_items FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert items to their campaigns"
  ON campaign_items FOR INSERT
  WITH CHECK (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update items of their campaigns"
  ON campaign_items FOR UPDATE
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- 7. CAMPAIGN LOGS (Kampanya Logları)
-- =====================================================

CREATE TABLE IF NOT EXISTS campaign_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  item_id UUID REFERENCES campaign_items(id) ON DELETE SET NULL,
  level TEXT DEFAULT 'info' CHECK (level IN ('info', 'success', 'warning', 'error')),
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_campaign_logs_campaign ON campaign_logs(campaign_id);
CREATE INDEX idx_campaign_logs_created ON campaign_logs(created_at DESC);
CREATE INDEX idx_campaign_logs_level ON campaign_logs(level);

ALTER TABLE campaign_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs of their campaigns"
  ON campaign_logs FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- 8. SYSTEM SETTINGS (Sistem Ayarları)
-- =====================================================

CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default Settings
INSERT INTO system_settings (key, value, description) VALUES
  ('max_global_concurrent_calls', '100', 'Sistemdeki maksimum eşzamanlı arama sayısı'),
  ('default_phone_number_id', '', 'Varsayılan telefon numarası ID (VAPI)'),
  ('webhook_secret', '', 'VAPI webhook secret key'),
  ('call_timeout_seconds', '300', 'Arama timeout süresi (saniye)')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read system settings"
  ON system_settings FOR SELECT
  USING (true);

CREATE POLICY "Only service role can modify system settings"
  ON system_settings FOR ALL
  USING (auth.role() = 'service_role');

-- =====================================================
-- 9. FUNCTIONS & TRIGGERS
-- =====================================================

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_vapi_accounts_updated_at BEFORE UPDATE ON vapi_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_items_updated_at BEFORE UPDATE ON campaign_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vapi_phone_numbers_updated_at BEFORE UPDATE ON vapi_phone_numbers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 10. COMMENTS
-- =====================================================

COMMENT ON TABLE vapi_accounts IS 'Çoklu VAPI hesap yönetimi - Otomatik hesap değiştirme ve bakiye takibi';
COMMENT ON TABLE vapi_balance_logs IS 'VAPI hesap bakiye değişim logları';
COMMENT ON TABLE vapi_account_switch_logs IS 'VAPI hesap değişim logları';
COMMENT ON TABLE vapi_phone_numbers IS 'VAPI telefon numaraları - Her hesaba özel';
COMMENT ON TABLE campaigns IS 'Kampanya yönetimi - Toplu arama kampanyaları';
COMMENT ON TABLE campaign_items IS 'Kampanya kişileri - Aranacak kişiler ve durumları';
COMMENT ON TABLE campaign_logs IS 'Kampanya işlem logları';
COMMENT ON TABLE system_settings IS 'Sistem geneli ayarlar';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================