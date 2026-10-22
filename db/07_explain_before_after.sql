ALTER TABLE titles DROP INDEX idx_titles_kind_status_year;
EXPLAIN SELECT id, title, release_year FROM titles
 WHERE kind = 'movie' AND status = 'published' AND release_year BETWEEN 1990 AND 2010
 ORDER BY release_year DESC, id DESC LIMIT 20;

CREATE INDEX idx_titles_kind_status_year ON titles (kind, status, release_year);
EXPLAIN SELECT id, title, release_year FROM titles
 WHERE kind = 'movie' AND status = 'published' AND release_year BETWEEN 1990 AND 2010
 ORDER BY release_year DESC, id DESC LIMIT 20;

EXPLAIN ANALYZE SELECT COUNT(*), AVG(score) FROM ratings WHERE title_id = 42;
EXPLAIN SELECT id FROM titles WHERE title_search LIKE '%mo phong 4%';
EXPLAIN SELECT id FROM titles WHERE MATCH(title_search) AGAINST('mo phong' IN BOOLEAN MODE); 
