-- Migration: Add permissions column for RBAC (Role-Based Access Control)
-- Cho phép Owner tùy chỉnh quyền hạn chi tiết của từng Staff

ALTER TABLE users_properties
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- Cập nhật RLS policy: Staff chỉ có thể đọc dữ liệu thuộc property của mình
-- (Các policy hiện tại đã kiểm tra user_id + property_id, nên Staff tự động bị giới hạn)

COMMENT ON COLUMN users_properties.permissions IS
'JSON object chứa các quyền tùy chỉnh cho staff. Ví dụ:
{
  "can_view_bookings": true,
  "can_view_conversations": true,
  "can_view_calendar": true,
  "can_edit_rooms": false,
  "can_edit_knowledge": false,
  "can_view_revenue": false,
  "can_view_usage": false,
  "can_edit_settings": false,
  "can_manage_billing": false
}
Owner luôn có full quyền (permissions bị bỏ qua khi role=owner).';
