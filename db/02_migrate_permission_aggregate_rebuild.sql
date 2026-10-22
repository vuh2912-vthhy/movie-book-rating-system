INSERT IGNORE INTO permissions (code, resource, action) VALUES ('aggregate.rebuild', 'aggregate', 'rebuild');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'aggregate.rebuild' WHERE r.code = 'ADMIN';

SELECT r.code AS vai_tro
FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
WHERE p.code = 'aggregate.rebuild';
