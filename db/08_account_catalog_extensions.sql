-- Ngày 19: bổ sung khôi phục mật khẩu, quản lý thể loại và nhân vật. Chạy MỘT lần trên mỗi CSDL (an toàn khi chạy lại).
CREATE TABLE IF NOT EXISTS password_resets (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64)        NOT NULL,           -- SHA-256 của mã đặt lại; KHÔNG lưu mã gốc
  expires_at DATETIME        NOT NULL,
  used_at    DATETIME        NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_resets_hash (token_hash),
  KEY idx_password_resets_user (user_id, used_at),
  CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO permissions (code, resource, action) VALUES
  ('genre.manage', 'genre', 'manage'),
  ('person.manage', 'person', 'manage');

-- Thể loại: chỉ ADMIN. Nhân vật: MODERATOR và ADMIN.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'genre.manage' WHERE r.code = 'ADMIN';
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'person.manage' WHERE r.code IN ('ADMIN', 'MODERATOR');
-- Bảo đảm ADMIN có quyền quản lý người dùng và vai trò
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN ('user.manage', 'role.manage') WHERE r.code = 'ADMIN';

SELECT r.code AS vai_tro, p.code AS quyen FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
WHERE p.code IN ('genre.manage', 'person.manage', 'user.manage', 'role.manage') ORDER BY p.code, r.code;
