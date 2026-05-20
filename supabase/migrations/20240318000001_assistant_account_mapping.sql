-- Assistant to VAPI Account Mapping
-- Her kullanıcı asistanı, her VAPI hesabında farklı ID'ye sahip olabilir

CREATE TABLE IF NOT EXISTS assistant_account_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assistant_id UUID NOT NULL REFERENCES assistant(id) ON DELETE CASCADE,
  vapi_account_id UUID NOT NULL REFERENCES vapi_accounts(id) ON DELETE CASCADE,
  vapi_assistant_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(assistant_id, vapi_account_id)
);

-- Index for fast lookups
CREATE INDEX idx_assistant_account_mapping_assistant ON assistant_account_mapping(assistant_id);
CREATE INDEX idx_assistant_account_mapping_account ON assistant_account_mapping(vapi_account_id);

-- RLS Policies
ALTER TABLE assistant_account_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own assistant mappings"
  ON assistant_account_mapping
  FOR SELECT
  USING (
    assistant_id IN (
      SELECT id FROM assistant WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage assistant mappings"
  ON assistant_account_mapping
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE assistant_account_mapping IS 'Maps user assistants to VAPI account-specific assistant IDs';