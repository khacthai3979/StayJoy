-- Thêm cột telegram_chat_id vào bảng properties
ALTER TABLE properties ADD COLUMN telegram_chat_id text;

-- Không cần thêm RLS Policy mới cho properties vì các policy hiện tại (013_properties_rls_policies.sql)
-- đã cho phép owner (thông qua bảng users_properties) được UPDATE toàn bộ record của họ,
-- do đó họ có quyền sửa đổi trường này tự động.
