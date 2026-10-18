-- Ảnh 27, 28: kế hoạch thực thi TRƯỚC và SAU khi tạo chỉ mục. Chạy từng khối, chụp kết quả cột type / key / rows.
-- Truy vấn nóng: danh sách tác phẩm đã xuất bản theo loại, năm (trang chủ + bộ lọc).

-- ===== TRƯỚC: bỏ chỉ mục kết hợp =====
ALTER TABLE titles DROP INDEX idx_titles_kind_status_year;
EXPLAIN SELECT id, title, release_year FROM titles
 WHERE kind = 'movie' AND status = 'published' AND release_year BETWEEN 1990 AND 2010
 ORDER BY release_year DESC, id DESC LIMIT 20;
-- Kỳ vọng: type = ALL (quét toàn bảng) hoặc dùng chỉ mục kém chọn lọc, Extra có "Using filesort"

-- ===== SAU: tạo lại chỉ mục kết hợp (kind, status, release_year) =====
CREATE INDEX idx_titles_kind_status_year ON titles (kind, status, release_year);
EXPLAIN SELECT id, title, release_year FROM titles
 WHERE kind = 'movie' AND status = 'published' AND release_year BETWEEN 1990 AND 2010
 ORDER BY release_year DESC, id DESC LIMIT 20;
-- Kỳ vọng: type = range, key = idx_titles_kind_status_year, rows giảm rõ rệt

-- ===== Truy vấn nóng thứ hai: điểm chấm theo tác phẩm (EXPLAIN ANALYZE cho số liệu thời gian thật) =====
EXPLAIN ANALYZE SELECT COUNT(*), AVG(score) FROM ratings WHERE title_id = 42;
-- ===== Tìm kiếm: so sánh LIKE %...% với FULLTEXT =====
EXPLAIN SELECT id FROM titles WHERE title_search LIKE '%mo phong 4%';                       -- quét toàn bảng
EXPLAIN SELECT id FROM titles WHERE MATCH(title_search) AGAINST('mo phong' IN BOOLEAN MODE); -- dùng ft_titles_search
