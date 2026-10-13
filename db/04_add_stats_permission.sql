-- Ngày 4: thêm quyền stats.analytics (xem báo cáo thống kê chuyên sâu) cho MODERATOR và ADMIN.
-- Quyền stats.read (bảng xếp hạng công khai) vẫn dành cho mọi vai trò; stats.export vẫn chỉ ADMIN.
-- Chạy MỘT lần trên mỗi CSDL (an toàn nếu chạy lại nhờ INSERT IGNORE). Không cần nạp lại seed.
INSERT IGNORE INTO permissions (code, resource, action) VALUES ('stats.analytics', 'stats', 'analytics');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'stats.analytics'
WHERE r.code IN ('ADMIN', 'MODERATOR');

-- Kiểm tra: phải thấy đúng 2 dòng (ADMIN, MODERATOR)
SELECT r.code AS vai_tro
FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
WHERE p.code = 'stats.analytics'
ORDER BY r.code;
