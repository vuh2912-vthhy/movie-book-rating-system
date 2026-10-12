'use strict';
const db = require('../config/database');

class WatchlistRepository {
    // UPDATE trước, không có dòng thì INSERT; khóa duy nhất (user_id, title_id) chặn trùng khi gửi đồng thời
    static async upsert(userId, titleId, listType) {
        const [updated] = await db.query('UPDATE watchlists SET list_type = ? WHERE user_id = ? AND title_id = ?', [listType, userId, titleId]);
        if (updated.affectedRows > 0) return { created: false };
        try {
            await db.query('INSERT INTO watchlists (user_id, title_id, list_type) VALUES (?, ?, ?)', [userId, titleId, listType]);
            return { created: true };
        } catch (error) {
            if (error && error.code === 'ER_DUP_ENTRY') {
                await db.query('UPDATE watchlists SET list_type = ? WHERE user_id = ? AND title_id = ?', [listType, userId, titleId]);
                return { created: false };
            }
            throw error;
        }
    }

    static async remove(userId, titleId) {
        const [result] = await db.query('DELETE FROM watchlists WHERE user_id = ? AND title_id = ?', [userId, titleId]);
        return result.affectedRows > 0;
    }

    static async list(userId, listType, limit, offset) {
        const params = [userId];
        let extra = '';
        if (listType) { extra = ' AND w.list_type = ?'; params.push(listType); }
        const [rows] = await db.query(
            `SELECT w.title_id, w.list_type, w.added_at, t.code, t.kind, t.title, t.release_year,
                    a.rating_count, a.rating_avg, a.weighted_score
             FROM watchlists w
             JOIN titles t ON t.id = w.title_id
             JOIN aggregates a ON a.title_id = t.id
             WHERE w.user_id = ? AND t.status = 'published'${extra}
             ORDER BY w.added_at DESC, w.title_id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        return rows;
    }

    static async count(userId, listType) {
        const params = [userId];
        let extra = '';
        if (listType) { extra = ' AND w.list_type = ?'; params.push(listType); }
        const [rows] = await db.query(
            `SELECT COUNT(*) AS total FROM watchlists w JOIN titles t ON t.id = w.title_id
             WHERE w.user_id = ? AND t.status = 'published'${extra}`,
            params
        );
        return Number(rows[0].total);
    }
}

module.exports = WatchlistRepository;
