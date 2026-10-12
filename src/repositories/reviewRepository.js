'use strict';
// Tầng truy cập dữ liệu cho bình luận. Trạng thái bình luận chỉ thay đổi qua các hàm giao dịch bên dưới.
const db = require('../config/database');
const { withTransaction } = require('../utils/transaction');
const AggregateRepository = require('./aggregateRepository');

// Máy trạng thái (Hình 2.5): trạng thái hiện tại -> { hành động: trạng thái mới }
const TRANSITIONS = {
    pending: { approve: 'approved', reject: 'rejected' },
    approved: { hide: 'hidden' },
    hidden: { restore: 'approved' }
};

const PUBLIC_ORDER = {
    newest: 'v.created_at DESC, v.id DESC',
    helpful: '(SELECT COALESCE(SUM(x.vote), 0) FROM review_votes x WHERE x.review_id = v.id) DESC, v.id DESC'
};

class ReviewRepository {
    // ------------------------------------------------------------ đọc
    static async findPublicByTitle(titleId, sort, limit, offset) {
        const [rows] = await db.query(
            `SELECT v.id, v.body, v.created_at, v.updated_at, u.display_name, r.score AS author_score
             FROM reviews v
             JOIN users u ON u.id = v.user_id
             LEFT JOIN ratings r ON r.user_id = v.user_id AND r.title_id = v.title_id
             WHERE v.title_id = ? AND v.status = 'approved'
             ORDER BY ${PUBLIC_ORDER[sort] || PUBLIC_ORDER.newest}
             LIMIT ? OFFSET ?`,
            [titleId, limit, offset]
        );
        return rows;
    }

    static async countPublicByTitle(titleId) {
        const [rows] = await db.query("SELECT COUNT(*) AS total FROM reviews WHERE title_id = ? AND status = 'approved'", [titleId]);
        return Number(rows[0].total);
    }

    static async findVoteCounts(reviewIds) {
        if (!reviewIds.length) return [];
        const [rows] = await db.query(
            `SELECT review_id,
                    SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS up,
                    SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS down
             FROM review_votes WHERE review_id IN (?) GROUP BY review_id`,
            [reviewIds]
        );
        return rows;
    }

    static async findMyVotes(userId, reviewIds) {
        if (!reviewIds.length) return [];
        const [rows] = await db.query('SELECT review_id, vote FROM review_votes WHERE user_id = ? AND review_id IN (?)', [userId, reviewIds]);
        return rows;
    }

    static async findMine(userId, titleId) {
        const [rows] = await db.query(
            'SELECT id, body, status, created_at, updated_at, moderated_at FROM reviews WHERE user_id = ? AND title_id = ? LIMIT 1',
            [userId, titleId]
        );
        return rows.length ? rows[0] : null;
    }

    static async listMine(userId, limit, offset) {
        const [rows] = await db.query(
            `SELECT v.id, v.title_id, t.code, t.title, v.body, v.status, v.created_at, v.updated_at
             FROM reviews v JOIN titles t ON t.id = v.title_id
             WHERE v.user_id = ?
             ORDER BY v.created_at DESC, v.id DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );
        return rows;
    }

    static async countMine(userId) {
        const [rows] = await db.query('SELECT COUNT(*) AS total FROM reviews WHERE user_id = ?', [userId]);
        return Number(rows[0].total);
    }

    static async hasRating(userId, titleId) {
        const [rows] = await db.query('SELECT 1 FROM ratings WHERE user_id = ? AND title_id = ? LIMIT 1', [userId, titleId]);
        return rows.length > 0;
    }

    static async findById(id) {
        const [rows] = await db.query('SELECT id, user_id, title_id, status FROM reviews WHERE id = ? LIMIT 1', [id]);
        return rows.length ? rows[0] : null;
    }

    // ------------------------------------------------------------ viết
    static async create({ userId, titleId, body }) {
        const [result] = await db.query(
            "INSERT INTO reviews (user_id, title_id, body, status) VALUES (?, ?, ?, 'pending')",
            [userId, titleId, body]
        );
        return result.insertId;
    }

    // Sửa bình luận của chính mình: quay về chờ duyệt. Bình luận đã bị ẩn thì không được sửa.
    static async updateMine({ userId, titleId, body }) {
        return withTransaction(async (conn) => {
            if (!(await AggregateRepository.lock(conn, titleId))) return { notFound: true };
            const [rows] = await conn.query('SELECT id, status FROM reviews WHERE user_id = ? AND title_id = ? FOR UPDATE', [userId, titleId]);
            if (!rows.length) return { notFound: true };
            const current = rows[0];
            if (current.status === 'hidden') return { blocked: true, id: current.id };

            await conn.query(
                `UPDATE reviews SET body = ?, status = 'pending', moderated_by = NULL, moderated_at = NULL,
                        updated_at = UTC_TIMESTAMP() WHERE id = ?`,
                [body, current.id]
            );
            if (current.status === 'approved') await AggregateRepository.recountReviews(conn, titleId);
            return { id: current.id, previousStatus: current.status };
        }, { isolation: 'READ COMMITTED' });
    }

    static async removeMine({ userId, titleId }) {
        return withTransaction(async (conn) => {
            if (!(await AggregateRepository.lock(conn, titleId))) return { notFound: true };
            const [rows] = await conn.query('SELECT id, status FROM reviews WHERE user_id = ? AND title_id = ? FOR UPDATE', [userId, titleId]);
            if (!rows.length) return { notFound: true };
            // Phiếu bình chọn và báo cáo gắn với bình luận bị xóa theo (ON DELETE CASCADE)
            await conn.query('DELETE FROM reviews WHERE id = ?', [rows[0].id]);
            if (rows[0].status === 'approved') await AggregateRepository.recountReviews(conn, titleId);
            return { id: rows[0].id, previousStatus: rows[0].status };
        }, { isolation: 'READ COMMITTED' });
    }

    // ------------------------------------------------------------ kiểm duyệt
    /**
     * Chuyển trạng thái bình luận theo máy trạng thái. Hai người kiểm duyệt cùng thao tác một bình luận
     * được xếp hàng bằng khóa dòng: người đến sau thấy trạng thái đã đổi nên bị từ chối (invalid).
     */
    static async moderate({ reviewId, action, moderatorId }) {
        return withTransaction(async (conn) => {
            const [peek] = await conn.query(
                `SELECT v.title_id FROM reviews v WHERE v.id = ?`, [reviewId]);
            if (!peek.length) return { notFound: true };
            const titleId = peek[0].title_id;

            await AggregateRepository.lock(conn, titleId); // luôn khóa aggregates trước reviews
            const [rows] = await conn.query(
                `SELECT v.id, v.user_id, v.status, t.title AS title_name
                 FROM reviews v JOIN titles t ON t.id = v.title_id WHERE v.id = ? FOR UPDATE`,
                [reviewId]
            );
            if (!rows.length) return { notFound: true };
            const review = rows[0];

            const next = (TRANSITIONS[review.status] || {})[action];
            if (!next) return { invalid: true, from: review.status };

            await conn.query(
                'UPDATE reviews SET status = ?, moderated_by = ?, moderated_at = UTC_TIMESTAMP() WHERE id = ?',
                [next, moderatorId, reviewId]
            );
            if (review.status === 'approved' || next === 'approved') await AggregateRepository.recountReviews(conn, titleId);
            return { ok: true, from: review.status, to: next, authorId: review.user_id, titleId, titleName: review.title_name };
        }, { isolation: 'READ COMMITTED' });
    }

    static async listForModeration(status, limit, offset) {
        const order = status === 'pending' ? 'v.created_at ASC, v.id ASC' : 'v.id DESC';
        const [rows] = await db.query(
            `SELECT v.id, v.body, v.status, v.created_at, v.moderated_at, v.title_id,
                    t.code AS title_code, t.title AS title_name, u.display_name AS author_name,
                    (SELECT COUNT(*) FROM reports p WHERE p.review_id = v.id AND p.status = 'open') AS open_reports
             FROM reviews v
             JOIN titles t ON t.id = v.title_id
             JOIN users u ON u.id = v.user_id
             WHERE v.status = ?
             ORDER BY ${order}
             LIMIT ? OFFSET ?`,
            [status, limit, offset]
        );
        return rows;
    }

    static async countForModeration(status) {
        const [rows] = await db.query('SELECT COUNT(*) AS total FROM reviews WHERE status = ?', [status]);
        return Number(rows[0].total);
    }
}

ReviewRepository.TRANSITIONS = TRANSITIONS;
module.exports = ReviewRepository;
