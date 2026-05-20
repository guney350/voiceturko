-- =====================================================
-- CHATBOT SİSTEMİ
-- =====================================================
-- 1. chatbot_settings: AI personality, model, sistem prompt (admin yönetir)
-- 2. chat_conversations: User'ın sohbet oturumları
-- 3. chat_messages: Mesajlar (user / assistant / system)
-- 4. support_tickets: Canlı destek talepleri (email handoff)
-- =====================================================

-- =====================================================
-- 1. CHATBOT SETTINGS (Singleton config)
-- =====================================================

CREATE TABLE IF NOT EXISTS chatbot_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text DEFAULT 'VoiceTurko Asistanı',
  avatar_url text,
  model text DEFAULT 'gpt-4o-mini',
  temperature numeric(3, 2) DEFAULT 0.7,
  max_tokens integer DEFAULT 1000,
  personality text DEFAULT 'Sen VoiceTurko platformunun yardımsever, profesyonel ve samimi müşteri destek asistanısın. Kullanıcılara Türkçe yardım et, kısa ve net cevaplar ver, gerektiğinde adım adım rehberlik et.',
  enabled boolean DEFAULT true,
  welcome_message text DEFAULT 'Merhaba! Size nasıl yardımcı olabilirim? Sistem hakkında soru sorabilir, kurulum yardımı isteyebilir veya canlı desteğe bağlanabilirsiniz.',
  fallback_to_human boolean DEFAULT true,
  support_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tek satır olsun
INSERT INTO chatbot_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM chatbot_settings);

ALTER TABLE chatbot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chatbot_settings_read_all" ON chatbot_settings
  FOR SELECT USING (true);

-- =====================================================
-- 2. CHAT CONVERSATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  context_page text, -- hangi sayfadan başlatıldı
  status text DEFAULT 'active' CHECK (status IN ('active', 'closed', 'escalated')),
  message_count integer DEFAULT 0,
  last_message_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_user ON chat_conversations(user_id, last_message_at DESC);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_conv_own" ON chat_conversations
  FOR SELECT USING (user_id = auth.uid());

-- =====================================================
-- 3. CHAT MESSAGES
-- =====================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  tokens integer,
  model text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chat_messages(conversation_id, created_at);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_msg_own_conv" ON chat_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM chat_conversations WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- 4. SUPPORT TICKETS (Canlı destek talepleri)
-- =====================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  conversation_id uuid REFERENCES chat_conversations(id) ON DELETE SET NULL,
  subject text NOT NULL,
  message text NOT NULL,
  context_page text,
  context_data jsonb,
  status text DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  email_sent boolean DEFAULT false,
  email_sent_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id, created_at DESC);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_tickets_own" ON support_tickets
  FOR SELECT USING (user_id = auth.uid());

-- =====================================================
-- DONE
-- =====================================================
DO $$ BEGIN
  RAISE NOTICE '✅ Chatbot tablolar oluşturuldu';
  RAISE NOTICE '🤖 Default model: gpt-4o-mini';
  RAISE NOTICE '📧 Support email: chatbot_settings.support_email den ayarla';
END $$;
