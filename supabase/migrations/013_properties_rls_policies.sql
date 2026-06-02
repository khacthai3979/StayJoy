-- Migration: Add tenant read/write policies to properties table
-- This allows owners/staff/users to select and update their own properties, fixing RLS blocks.

-- 1. Policy to allow users linked to a property to select it
CREATE POLICY "tenant_select_own_properties"
ON properties FOR SELECT
USING (
  id IN (
    SELECT property_id FROM users_properties
    WHERE user_id = auth.uid()
  )
);

-- 2. Policy to allow users linked to a property to update it
CREATE POLICY "tenant_update_own_properties"
ON properties FOR UPDATE
USING (
  id IN (
    SELECT property_id FROM users_properties
    WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  id IN (
    SELECT property_id FROM users_properties
    WHERE user_id = auth.uid()
  )
);
