-- Ngày 16: nạp 5 000 tác phẩm mô phỏng (mã PERF-xxxxxx) + điểm chấm để đo hiệu năng (>= 5 000 bản ghi bảng chính).
-- Chạy trên MySQL 8 (Aiven). Sau khi chạy: POST /api/v1/admin/aggregates/rebuild (ADMIN) để dựng lại bảng tổng hợp.
-- Dọn dẹp khi xong: xem cuối tệp.
SET SESSION cte_max_recursion_depth = 6000;

INSERT INTO titles (code, kind, title, original_title, title_search, release_year, runtime_min, page_count, synopsis, status, created_at)
WITH RECURSIVE seq AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM seq WHERE n < 5000)
SELECT CONCAT('PERF-', LPAD(n, 6, '0')),
       IF(n % 2 = 0, 'movie', 'book'),
       CONCAT('Tac pham mo phong ', n),
       NULL,
       LOWER(CONCAT('tac pham mo phong ', n)),
       1950 + (n % 75),
       IF(n % 2 = 0, 80 + (n % 90), NULL),
       IF(n % 2 = 0, NULL, 120 + (n % 400)),
       'Du lieu mo phong phuc vu do hieu nang',
       'published',
       DATE_SUB(NOW(), INTERVAL (n % 700) DAY)
FROM seq;

-- Mỗi tác phẩm mô phỏng nhận 1 điểm chấm của một người dùng có sẵn (không vi phạm UNIQUE user+title)
INSERT INTO ratings (user_id, title_id, score, created_at, updated_at)
SELECT (SELECT MIN(id) FROM users) + (t.id % (SELECT COUNT(*) FROM users)),
       t.id, 1 + (t.id % 5), DATE_SUB(NOW(), INTERVAL (t.id % 400) DAY), NULL
FROM titles t WHERE t.code LIKE 'PERF-%';

INSERT IGNORE INTO aggregates (title_id) SELECT id FROM titles WHERE code LIKE 'PERF-%';

SELECT (SELECT COUNT(*) FROM titles) AS tong_titles, (SELECT COUNT(*) FROM ratings) AS tong_ratings;

-- DỌN DẸP (chỉ khi cần trả CSDL về trạng thái cũ):
--   DELETE FROM ratings   WHERE title_id IN (SELECT id FROM titles WHERE code LIKE 'PERF-%');
--   DELETE FROM aggregates WHERE title_id IN (SELECT id FROM titles WHERE code LIKE 'PERF-%');
--   DELETE FROM titles    WHERE code LIKE 'PERF-%';
