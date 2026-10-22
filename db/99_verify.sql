SELECT COUNT(*) AS so_bang FROM information_schema.tables WHERE table_schema = DATABASE();

SELECT 'users' AS bang, COUNT(*) AS so_dong FROM users
UNION ALL SELECT 'titles', COUNT(*) FROM titles
UNION ALL SELECT 'ratings', COUNT(*) FROM ratings
UNION ALL SELECT 'reviews', COUNT(*) FROM reviews
UNION ALL SELECT 'aggregates', COUNT(*) FROM aggregates
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;

SELECT u.email, r.code AS vai_tro
FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
WHERE u.email IN ('admin01@demo.local', 'mod01@demo.local', 'user001@demo.local');

SELECT a.title_id
FROM aggregates a
WHERE a.rating_count <> (SELECT COUNT(*) FROM ratings r WHERE r.title_id = a.title_id)
   OR a.rating_sum   <> (SELECT COALESCE(SUM(score), 0) FROM ratings r WHERE r.title_id = a.title_id);

SELECT t.code, t.title, a.rating_count, a.rating_avg, a.weighted_score
FROM aggregates a JOIN titles t ON t.id = a.title_id
ORDER BY a.weighted_score DESC LIMIT 5;
