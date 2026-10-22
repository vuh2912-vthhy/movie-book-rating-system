INSERT IGNORE INTO permissions (code, resource, action) VALUES ('stats.analytics', 'stats', 'analytics');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'stats.analytics'
WHERE r.code IN ('ADMIN', 'MODERATOR');

SELECT r.code AS vai_tro
FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
WHERE p.code = 'stats.analytics'
ORDER BY r.code;
