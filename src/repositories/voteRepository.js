'use strict';
const db = require('../config/database');

class VoteRepository {

    static async upsert(reviewId, userId, vote) {
        const [updated] = await db.query('UPDATE review_votes SET vote = ? WHERE review_id = ? AND user_id = ?', [vote, reviewId, userId]);
        if (updated.affectedRows > 0) return { created: false };
        try {
            await db.query('INSERT INTO review_votes (review_id, user_id, vote) VALUES (?, ?, ?)', [reviewId, userId, vote]);
            return { created: true };
        } catch (error) {
            if (error && error.code === 'ER_DUP_ENTRY') {
                await db.query('UPDATE review_votes SET vote = ? WHERE review_id = ? AND user_id = ?', [vote, reviewId, userId]);
                return { created: false };
            }
            throw error;
        }
    }

    static async remove(reviewId, userId) {
        const [result] = await db.query('DELETE FROM review_votes WHERE review_id = ? AND user_id = ?', [reviewId, userId]);
        return result.affectedRows > 0;
    }

    static async counts(reviewId) {
        const [rows] = await db.query(
            `SELECT COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) AS up,
                    COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) AS down
             FROM review_votes WHERE review_id = ?`,
            [reviewId]
        );
        return { up: Number(rows[0].up), down: Number(rows[0].down) };
    }
}

module.exports = VoteRepository;
