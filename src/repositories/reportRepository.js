'use strict';
const db = require('../config/database');
const { withTransaction } = require('../utils/transaction');
const AggregateRepository = require('./aggregateRepository');

class ReportRepository {
    // Mỗi người chỉ báo cáo một bình luận một lần: khóa duy nhất (review_id, reporter_id)
    static async create({ reviewId, reporterId, reason, detail }) {
        const [result] = await db.query(
            'INSERT INTO reports (review_id, reporter_id, reason, detail) VALUES (?, ?, ?, ?)',
            [reviewId, reporterId, reason, detail]
        );
        return result.insertId;
    }

    static async listForModeration(status, limit, offset) {
        const order = status === 'open' ? 'p.created_at ASC, p.id ASC' : 'p.id DESC';
        const [rows] = await db.query(
            `SELECT p.id, p.review_id, p.reason, p.detail, p.status, p.created_at, p.handled_at,
                    v.body AS review_body, v.status AS review_status,
                    au.display_name AS author_name, ru.display_name AS reporter_name,
                    t.id AS title_id, t.code AS title_code, t.title AS title_name
             FROM reports p
             JOIN reviews v ON v.id = p.review_id
             JOIN users au ON au.id = v.user_id
             JOIN users ru ON ru.id = p.reporter_id
             JOIN titles t ON t.id = v.title_id
             WHERE p.status = ?
             ORDER BY ${order}
             LIMIT ? OFFSET ?`,
            [status, limit, offset]
        );
        return rows;
    }

    static async countForModeration(status) {
        const [rows] = await db.query('SELECT COUNT(*) AS total FROM reports WHERE status = ?', [status]);
        return Number(rows[0].total);
    }

    /**
     * Xử lý một báo cáo đang mở.
     *  - resolve: bình luận đang công khai bị ẩn; mọi báo cáo mở khác về cùng bình luận được đóng cùng lúc.
     *  - dismiss: chỉ đóng báo cáo này, bình luận giữ nguyên.
     * Khóa theo thứ tự aggregates -> reports/reviews để không bế tắc với luồng chấm điểm và duyệt.
     */
    static async handle({ reportId, decision, handlerId }) {
        return withTransaction(async (conn) => {
            const [peek] = await conn.query(
                `SELECT p.review_id, v.title_id FROM reports p JOIN reviews v ON v.id = p.review_id WHERE p.id = ?`,
                [reportId]
            );
            if (!peek.length) return { notFound: true };
            const { review_id: reviewId, title_id: titleId } = peek[0];

            await AggregateRepository.lock(conn, titleId);
            const [reports] = await conn.query('SELECT id, status, reporter_id FROM reports WHERE id = ? FOR UPDATE', [reportId]);
            if (!reports.length) return { notFound: true };
            if (reports[0].status !== 'open') return { closed: true };

            const [reviews] = await conn.query(
                `SELECT v.id, v.user_id, v.status, t.title AS title_name
                 FROM reviews v JOIN titles t ON t.id = v.title_id WHERE v.id = ? FOR UPDATE`,
                [reviewId]
            );
            const review = reviews[0];

            if (decision === 'dismiss') {
                await conn.query(
                    "UPDATE reports SET status = 'dismissed', handled_by = ?, handled_at = UTC_TIMESTAMP() WHERE id = ?",
                    [handlerId, reportId]
                );
                return { ok: true, decision, hidden: false, review: { id: review.id, authorId: review.user_id, titleName: review.title_name, status: review.status }, reporterIds: [reports[0].reporter_id] };
            }

            // resolve
            let hidden = false;
            if (review.status === 'approved') {
                await conn.query(
                    "UPDATE reviews SET status = 'hidden', moderated_by = ?, moderated_at = UTC_TIMESTAMP() WHERE id = ?",
                    [handlerId, reviewId]
                );
                await AggregateRepository.recountReviews(conn, titleId);
                hidden = true;
            }
            const [others] = await conn.query("SELECT reporter_id FROM reports WHERE review_id = ? AND status = 'open'", [reviewId]);
            await conn.query(
                `UPDATE reports SET status = 'resolved', handled_by = ?, handled_at = UTC_TIMESTAMP()
                 WHERE review_id = ? AND status = 'open'`,
                [handlerId, reviewId]
            );
            return {
                ok: true, decision, hidden,
                review: { id: review.id, authorId: review.user_id, titleName: review.title_name, status: hidden ? 'hidden' : review.status },
                reporterIds: others.map((r) => r.reporter_id)
            };
        }, { isolation: 'READ COMMITTED' });
    }
}

module.exports = ReportRepository;
