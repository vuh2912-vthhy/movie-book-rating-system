'use strict';
// Truy vấn thống kê (khối K7): nối nhiều bảng, hàm tổng hợp, điều kiện thời gian, hàm cửa sổ.
// Mọi giá trị từ người dùng đi qua tham số `?`; độ dài SUBSTR lấy từ danh sách cho phép.
const db = require('../config/database');

const GENRE_EXISTS = `EXISTS (SELECT 1 FROM title_genres tg JOIN genres g ON g.id = tg.genre_id
                               WHERE tg.title_id = t.id AND g.code = ?)`;

function titleFilters(filters) {
    const clauses = ["t.status = 'published'"];
    const params = [];
    if (filters.kind) { clauses.push('t.kind = ?'); params.push(filters.kind); }
    if (filters.genre) { clauses.push(GENRE_EXISTS); params.push(filters.genre); }
    return { where: clauses.join(' AND '), params };
}

class StatsRepository {
    // ---------------------------------------------------------- xếp hạng
    // Phương án 1: đọc cột tổng hợp đã duy trì sẵn (aggregates), có chỉ mục xếp hạng
    static async rankingAggregate(filters, limit) {
        const { where, params } = titleFilters(filters);
        const [rows] = await db.query(
            `SELECT t.id, t.code, t.kind, t.title, t.release_year, a.rating_count, a.rating_avg, a.weighted_score
             FROM titles t JOIN aggregates a ON a.title_id = t.id
             WHERE ${where}
             ORDER BY a.weighted_score DESC, a.rating_count DESC, t.id DESC
             LIMIT ?`,
            [...params, limit]
        );
        return rows;
    }

    // Phương án 2: tính khi đọc trực tiếp từ bảng ratings (dùng để so sánh hiệu năng, Mục 5.4)
    static async rankingLive(filters, limit, minVotes, prior) {
        const { where, params } = titleFilters(filters);
        const [rows] = await db.query(
            `SELECT t.id, t.code, t.kind, t.title, t.release_year,
                    COUNT(r.id) AS rating_count, COALESCE(SUM(r.score), 0) AS rating_sum
             FROM titles t LEFT JOIN ratings r ON r.title_id = t.id
             WHERE ${where}
             GROUP BY t.id, t.code, t.kind, t.title, t.release_year
             ORDER BY ((COALESCE(SUM(r.score), 0) + ? * ?) / (COUNT(r.id) + ?)) DESC, COUNT(r.id) DESC, t.id DESC
             LIMIT ?`,
            [...params, minVotes, prior, minVotes, limit]
        );
        return rows;
    }

    static async priorMeanFromRatings(fallback) {
        const [rows] = await db.query('SELECT COUNT(*) AS c, COALESCE(SUM(score), 0) AS s FROM ratings');
        return Number(rows[0].c) > 0 ? Number(rows[0].s) / Number(rows[0].c) : fallback;
    }

    // ---------------------------------------------------------- theo thể loại
    static async genreStats(kind) {
        const params = [];
        let kindClause = '';
        if (kind) { kindClause = ' AND t.kind = ?'; params.push(kind); }
        const [rows] = await db.query(
            `SELECT g.id, g.code, g.name,
                    COUNT(DISTINCT t.id) AS title_count,
                    COALESCE(SUM(a.rating_count), 0) AS rating_count,
                    COALESCE(SUM(a.rating_sum), 0) AS rating_sum,
                    COALESCE(SUM(a.review_count), 0) AS review_count
             FROM genres g
             LEFT JOIN title_genres tg ON tg.genre_id = g.id
             LEFT JOIN titles t ON t.id = tg.title_id AND t.status = 'published'${kindClause}
             LEFT JOIN aggregates a ON a.title_id = t.id
             GROUP BY g.id, g.code, g.name
             ORDER BY rating_count DESC, g.name ASC`,
            params
        );
        return rows;
    }

    // Tác phẩm đứng đầu mỗi thể loại bằng hàm cửa sổ ROW_NUMBER
    static async topTitlePerGenre(kind) {
        const params = [];
        let kindClause = '';
        if (kind) { kindClause = ' AND t.kind = ?'; params.push(kind); }
        const [rows] = await db.query(
            `SELECT genre_id, title_id, title, code, weighted_score FROM (
                SELECT tg.genre_id, t.id AS title_id, t.title, t.code, a.weighted_score,
                       ROW_NUMBER() OVER (PARTITION BY tg.genre_id
                                          ORDER BY a.weighted_score DESC, a.rating_count DESC, t.id DESC) AS rn
                FROM title_genres tg
                JOIN titles t ON t.id = tg.title_id AND t.status = 'published'${kindClause}
                JOIN aggregates a ON a.title_id = t.id
             ) x WHERE rn = 1`,
            params
        );
        return rows;
    }

    // ---------------------------------------------------------- theo thời gian
    // len = 7 (tháng, 'YYYY-MM') hoặc 10 (ngày, 'YYYY-MM-DD'); since là 'YYYY-MM-DD HH:MM:SS' (UTC)
    static async timeline(granularity, since, kind) {
        const len = granularity === 'day' ? 10 : 7;
        const params = [since];
        let kindClause = '';
        if (kind) { kindClause = ' AND t.kind = ?'; params.push(kind); }

        const [ratings] = await db.query(
            `SELECT SUBSTR(r.created_at, 1, ${len}) AS period, COUNT(*) AS ratings, SUM(r.score) AS score_sum
             FROM ratings r JOIN titles t ON t.id = r.title_id
             WHERE r.created_at >= ?${kindClause}
             GROUP BY SUBSTR(r.created_at, 1, ${len})
             ORDER BY period ASC`,
            params
        );
        const [reviews] = await db.query(
            `SELECT SUBSTR(v.created_at, 1, ${len}) AS period, COUNT(*) AS reviews,
                    SUM(CASE WHEN v.status = 'approved' THEN 1 ELSE 0 END) AS approved
             FROM reviews v JOIN titles t ON t.id = v.title_id
             WHERE v.created_at >= ?${kindClause}
             GROUP BY SUBSTR(v.created_at, 1, ${len})
             ORDER BY period ASC`,
            params
        );
        return { ratings, reviews };
    }

    // ---------------------------------------------------------- tổng quan
    static async overview(since30) {
        const [rows] = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM users) AS users_total,
                (SELECT COUNT(*) FROM users WHERE status = 'active') AS users_active,
                (SELECT COUNT(*) FROM titles) AS titles_total,
                (SELECT COUNT(*) FROM titles WHERE status = 'published') AS titles_published,
                (SELECT COUNT(*) FROM ratings) AS ratings_total,
                (SELECT COUNT(*) FROM ratings WHERE created_at >= ?) AS ratings_last_30_days,
                (SELECT COUNT(*) FROM reviews) AS reviews_total,
                (SELECT COUNT(*) FROM reviews WHERE status = 'pending') AS reviews_pending,
                (SELECT COUNT(*) FROM reviews WHERE status = 'approved') AS reviews_approved,
                (SELECT COUNT(*) FROM reviews WHERE status = 'rejected') AS reviews_rejected,
                (SELECT COUNT(*) FROM reviews WHERE status = 'hidden') AS reviews_hidden,
                (SELECT COUNT(*) FROM reports WHERE status = 'open') AS reports_open,
                (SELECT COUNT(*) FROM reports WHERE status = 'resolved') AS reports_resolved,
                (SELECT COUNT(*) FROM reports WHERE status = 'dismissed') AS reports_dismissed,
                (SELECT MIN(created_at) FROM reviews WHERE status = 'pending') AS oldest_pending_at`,
            [since30]
        );
        return rows[0];
    }

    // ---------------------------------------------------------- danh mục (xuất báo cáo)
    static async catalog(limit) {
        const [rows] = await db.query(
            `SELECT t.id, t.code, t.kind, t.title, t.release_year, a.rating_count, a.rating_avg, a.weighted_score, a.review_count
             FROM titles t JOIN aggregates a ON a.title_id = t.id
             WHERE t.status = 'published'
             ORDER BY t.id ASC
             LIMIT ?`,
            [limit]
        );
        return rows;
    }

    static async genreNamesForTitles(ids) {
        if (!ids.length) return [];
        const [rows] = await db.query(
            `SELECT tg.title_id, g.name FROM title_genres tg JOIN genres g ON g.id = tg.genre_id
             WHERE tg.title_id IN (?) ORDER BY g.name ASC`,
            [ids]
        );
        return rows;
    }
}

module.exports = StatsRepository;
