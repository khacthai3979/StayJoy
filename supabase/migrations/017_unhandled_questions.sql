-- Migration 017: Create unhandled_questions table to store AI feedback loop data
CREATE TABLE IF NOT EXISTS unhandled_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL,
  customer_message TEXT NOT NULL,
  ai_reason TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE unhandled_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view unhandled_questions of their properties"
  ON unhandled_questions FOR SELECT
  USING (property_id IN (
    SELECT property_id FROM users_properties WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update unhandled_questions of their properties"
  ON unhandled_questions FOR UPDATE
  USING (property_id IN (
    SELECT property_id FROM users_properties WHERE user_id = auth.uid()
  ));

-- Service Role (backend webhook) can bypass RLS, so no INSERT policy needed for users.
