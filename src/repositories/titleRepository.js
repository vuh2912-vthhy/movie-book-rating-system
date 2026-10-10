'use strict';
// Tầng truy cập dữ liệu cho tác phẩm (phim/sách). Chỉ SQL tham số hóa, không có nghiệp vụ.
const crypto = require('crypto');
const db = require('../config/database');
const { withTransaction } = require('../utils/transaction');
const { escapeLike, normalizeSearchText } = require('../utils/text');

// Danh sách cho phép: tên cột sắp xếp KHÔNG bao giờ lấy trực tiếp từ đầu vào của người dùng.
const ORDER_BY = {
    rating: 'a.weighted_score DESC, a.rating_count DESC, t.id DESC',
    newest: 't.created_at DESC, t.id DESC',
    popular: 'a.rating_count DESC, a.weighted_score DESC, t.id DESC',
    title: 't.title ASC, t.id ASC',
    year: 't.release_year DESC, t.id DESC'
};

const LIST_COLUMNS = `t.id, t.code, t.kind, t.title, t.original_title, t.release_year, t.runtime_min,
       t.page_count, t.poster_path, t.status, a.rating_count, a.rating_avg, a.weighted_score, a.review_count`;

// Ghép điều kiện WHERE từ bộ lọc đã được kiểm tra. Mọi giá trị đi qua tham số `?`.
function buildWhere(filters) {
    const clauses = [];
    const params = [];
    if (filters.status && filters.status !== 'all') { clauses.push('t.status = ?'); params.push(filters.status); }
    if (filters.kind) { clauses.push('t.kind = ?'); params.push(filters.kind); }
    if (filters.keyword) {
        const needle = normalizeSearchText(filters.keyword);
        if (needle) { clauses.push('t.title_search LIKE ?'); params.push(`%${escapeLike(needle)}%`); }
    }
    if (filters.genre) {
        clauses.push(`EXISTS (SELECT 1 FROM title_genres tg JOIN genres g ON g.id = tg.genre_id
                              WHERE tg.title_id = t.id AND g.code = ?)`);
        params.push(filters.genre);
    }
    if (filters.yearFrom) { clauses.push('t.release_year >= ?'); params.push(filters.yearFrom); }
    if (filters.yearTo) { clauses.push('t.release_year <= ?'); params.push(filters.yearTo); }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

class TitleRepository {
    static async findList(filters, limit, offset) {
        const { where, params } = buildWhere(filters);
        const order = ORDER_BY[filters.sort] || ORDER_BY.rating;
        const [rows] = await db.query(
            `SELECT ${LIST_COLUMNS}
             FROM titles t JOIN aggregates a ON a.title_id = t.id
             ${where}
             ORDER BY ${order}
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        return rows;
    }

    static async countList(filters) {
        const { where, params } = buildWhere(filters);
        const [rows] = await db.query(
            `SELECT COUNT(*) AS total FROM titles t JOIN aggregates a ON a.title_id = t.id ${where}`,
            params
        );
        return Number(rows[0].total);
    }

    // Lấy thể loại của cả trang bằng MỘT truy vấn (tránh truy vấn lặp N+1).
    static async findGenresForTitles(titleIds) {
        if (!titleIds.length) return [];
        const [rows] = await db.query(
            `SELECT tg.title_id, g.id, g.code, g.name
             FROM title_genres tg JOIN genres g ON g.id = tg.genre_id
             WHERE tg.title_id IN (?)
             ORDER BY g.name ASC`,
            [titleIds]
        );
        return rows;
    }

    static async findById(id) {
        const [rows] = await db.query(
            `SELECT t.*, a.rating_count, a.rating_avg, a.weighted_score, a.review_count
             FROM titles t LEFT JOIN aggregates a ON a.title_id = t.id
             WHERE t.id = ? LIMIT 1`,
            [id]
        );
        return rows.length ? rows[0] : null;
    }

    static async findCredits(titleId) {
        const [rows] = await db.query(
            `SELECT p.id, p.full_name, tp.credit_role, tp.billing_order
             FROM title_persons tp JOIN persons p ON p.id = tp.person_id
             WHERE tp.title_id = ?
             ORDER BY tp.credit_role ASC, tp.billing_order ASC, p.id ASC`,
            [titleId]
        );
        return rows;
    }

    // Tạo tác phẩm + thể loại + vai trò + dòng tổng hợp trong MỘT giao dịch.
    static async create(data, createdBy, priorMean) {
        return withTransaction(async (conn) => {
            const [inserted] = await conn.query(
                `INSERT INTO titles (code, kind, title, original_title, title_search, release_year,
                                     runtime_min, page_count, synopsis, status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [`TMP-${crypto.randomBytes(6).toString('hex')}`, data.kind, data.title, data.originalTitle,
                    normalizeSearchText(data.title, data.originalTitle), data.releaseYear, data.runtimeMin,
                    data.pageCount, data.synopsis, data.status, createdBy]
            );
            const id = inserted.insertId;
            const code = `${data.kind === 'movie' ? 'MOV' : 'BOK'}-${String(id).padStart(4, '0')}`;
            await conn.query('UPDATE titles SET code = ? WHERE id = ?', [code, id]);
            await TitleRepository.#writeRelations(conn, id, data);
            await conn.query(
                `INSERT INTO aggregates (title_id, rating_count, rating_sum, rating_avg, weighted_score, review_count)
                 VALUES (?, 0, 0, NULL, ?, 0)`,
                [id, priorMean]
            );
            return { id, code };
        });
    }

    // Thay toàn bộ thông tin (PUT). Trả về false nếu tác phẩm không tồn tại.
    static async replace(id, data) {
        return withTransaction(async (conn) => {
            const [locked] = await conn.query('SELECT id FROM titles WHERE id = ? FOR UPDATE', [id]);
            if (!locked.length) return false;
            await conn.query(
                `UPDATE titles SET title = ?, original_title = ?, title_search = ?, release_year = ?,
                        runtime_min = ?, page_count = ?, synopsis = ?, status = ?, updated_at = UTC_TIMESTAMP()
                 WHERE id = ?`,
                [data.title, data.originalTitle, normalizeSearchText(data.title, data.originalTitle),
                    data.releaseYear, data.runtimeMin, data.pageCount, data.synopsis, data.status, id]
            );
            await conn.query('DELETE FROM title_genres WHERE title_id = ?', [id]);
            await conn.query('DELETE FROM title_persons WHERE title_id = ?', [id]);
            await TitleRepository.#writeRelations(conn, id, data);
            return true;
        });
    }

    // "Xóa" là ẩn tác phẩm (giữ nguyên điểm và bình luận đã có)
    static async setStatus(id, status) {
        const [result] = await db.query(
            'UPDATE titles SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?',
            [status, id]
        );
        return result.affectedRows > 0;
    }

    static async #writeRelations(conn, titleId, data) {
        await conn.query('INSERT INTO title_genres (title_id, genre_id) VALUES ?',
            [data.genreIds.map((genreId) => [titleId, genreId])]);
        if (data.credits.length) {
            await conn.query('INSERT INTO title_persons (title_id, person_id, credit_role, billing_order) VALUES ?',
                [data.credits.map((c) => [titleId, c.personId, c.role, c.order])]);
        }
    }
}

module.exports = TitleRepository;
