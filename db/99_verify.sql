-- Kiểm tra sau khi nạp: chạy từng câu và so với kết quả mong đợi.

-- 1) Đủ 19 bảng (không còn bảng lạ). Mong đợi: 19
SELECT COUNT(*) AS so_bang FROM information_schema.tables WHERE table_schema = DATABASE();

-- 2) Số dòng (mặc định): users 400, titles 300, ratings 12000, reviews 2400, aggregates 300
SELECT 'users' AS bang, COUNT(*) AS so_dong FROM users
UNION ALL SELECT 'titles', COUNT(*) FROM titles
UNION ALL SELECT 'ratings', COUNT(*) FROM ratings
UNION ALL SELECT 'reviews', COUNT(*) FROM reviews
UNION ALL SELECT 'aggregates', COUNT(*) FROM aggregates
UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;

-- 3) Phân quyền: admin01 / mod01 / user001 phải có đúng vai trò. Mong đợi: ADMIN, MODERATOR, USER
SELECT u.email, r.code AS vai_tro
FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
WHERE u.email IN ('admin01@demo.local', 'mod01@demo.local', 'user001@demo.local');

-- 4) Đối soát bảng tổng hợp với dữ liệu gốc. Mong đợi: 0 dòng
SELECT a.title_id
FROM aggregates a
WHERE a.rating_count <> (SELECT COUNT(*) FROM ratings r WHERE r.title_id = a.title_id)
   OR a.rating_sum   <> (SELECT COALESCE(SUM(score), 0) FROM ratings r WHERE r.title_id = a.title_id);

-- 5) Xếp hạng có xét độ tin cậy: hai "bom tấn" (BOK-0021, BOK-0225) phải đứng đầu
SELECT t.code, t.title, a.rating_count, a.rating_avg, a.weighted_score
FROM aggregates a JOIN titles t ON t.id = a.title_id
ORDER BY a.weighted_score DESC LIMIT 5;
