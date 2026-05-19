-- ============================================================
-- Migration 008: LLM per-property + Multi-Channel Chatbot
-- ============================================================

-- 1. Add property_id to llm_settings (NULL = global/default config)
ALTER TABLE llm_settings ADD COLUMN property_id UUID REFERENCES properties(id) ON DELETE CASCADE;

-- Drop old unique index (only one active) and replace with per-property unique
DROP INDEX IF EXISTS idx_llm_settings_active;
CREATE UNIQUE INDEX idx_llm_settings_active_global
  ON llm_settings(is_active) WHERE is_active = true AND property_id IS NULL;
CREATE UNIQUE INDEX idx_llm_settings_active_property
  ON llm_settings(property_id, is_active) WHERE is_active = true AND property_id IS NOT NULL;

-- 2. Create channel_mappings table
CREATE TABLE channel_mappings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,  -- 'telegram', 'zalo', 'messenger', 'instagram', 'whatsapp', 'website'
  inbox_id    TEXT,           -- Chatwoot inbox_id (nullable for Zalo bridge)
  config      JSONB DEFAULT '{}',  -- channel-specific config (e.g. zalo_oa_id, access_token)
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_channel_mappings_property ON channel_mappings(property_id);
CREATE INDEX idx_channel_mappings_channel ON channel_mappings(channel, is_active);
CREATE UNIQUE INDEX idx_channel_mappings_unique ON channel_mappings(property_id, channel, inbox_id);

-- RLS for channel_mappings
ALTER TABLE channel_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage channel_mappings"
  ON channel_mappings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users_properties
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Tenant can view own channel_mappings"
  ON channel_mappings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users_properties
      WHERE user_id = auth.uid() AND property_id = channel_mappings.property_id
    )
  );

-- Service role (n8n) bypasses RLS automatically

-- Trigger for updated_at on channel_mappings
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_channel_mappings_updated_at
  BEFORE UPDATE ON channel_mappings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
