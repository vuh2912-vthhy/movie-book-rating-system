'use strict';

const db = require('../config/database');
const { average2, weightedScore } = require('../utils/rankingMath');
const { withTransaction } = require('../utils/transaction');

const round = (value, digits) => Number(value.toFixed(digits));

async function priorMeanFromAggregates(conn, fallback) {
    const [rows] = await conn.query(
        'SELECT COALESCE(SUM(rating_sum), 0) AS s, COALESCE(SUM(rating_count), 0) AS c FROM aggregates'
    );
    const sum = Number(rows[0].s);
    const count = Number(rows[0].c);
    return count > 0 ? sum / count : fallback;
}

async function recomputeAggregate(conn, titleId, minVotes, fallbackPrior) {
    const [rows] = await conn.query(
        'SELECT COUNT(*) AS c, COALESCE(SUM(score), 0) AS s FROM ratings WHERE title_id = ?',
        [titleId]
    );
    const count = Number(rows[0].c);
    const sum = Number(rows[0].s);
    const prior = await priorMeanFromAggregates(conn, fallbackPrior);
    const average = average2(sum, count);
    const weighted = weightedScore(sum, count, minVotes, prior);

    await conn.query(
        `UPDATE aggregates
         SET rating_count = ?, rating_sum = ?, rating_avg = ?, weighted_score = ?, updated_at = UTC_TIMESTAMP()
         WHERE title_id = ?`,
        [count, sum, average, weighted, titleId]
    );
    return { ratingCount: count, ratingAvg: average, weightedScore: weighted };
}

class RatingRepository {
    static async findMine(userId, titleId) {
        const [rows] = await db.query(
            'SELECT id, score FROM ratings WHERE user_id = ? AND title_id = ? LIMIT 1',
            [userId, titleId]
        );
        return rows.length ? { id: rows[0].id, score: Number(rows[0].score) } : null;
    }

    static async upsert({ userId, titleId, score, minVotes, fallbackPrior }) {
        return withTransaction(async (conn) => {
            const [locked] = await conn.query('SELECT title_id FROM aggregates WHERE title_id = ? FOR UPDATE', [titleId]);
            if (!locked.length) return null;

            const [existing] = await conn.query(
                'SELECT id, score FROM ratings WHERE user_id = ? AND title_id = ? FOR UPDATE',
                [userId, titleId]
            );

            let ratingId;
            let created = false;
            let previousScore = null;
            if (!existing.length) {
                const [inserted] = await conn.query(
                    'INSERT INTO ratings (user_id, title_id, score) VALUES (?, ?, ?)',
                    [userId, titleId, score]
                );
                ratingId = inserted.insertId;
                created = true;
            } else {
                ratingId = existing[0].id;
                previousScore = Number(existing[0].score);
                if (previousScore !== score) {
                    await conn.query('UPDATE ratings SET score = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [score, ratingId]);
                }
            }

            const stats = await recomputeAggregate(conn, titleId, minVotes, fallbackPrior);
            return { ratingId, created, previousScore, stats };
        }, { isolation: 'READ COMMITTED' });
    }

    static async remove({ userId, titleId, minVotes, fallbackPrior }) {
        return withTransaction(async (conn) => {
            const [locked] = await conn.query('SELECT title_id FROM aggregates WHERE title_id = ? FOR UPDATE', [titleId]);
            if (!locked.length) return null;

            const [existing] = await conn.query(
                'SELECT id FROM ratings WHERE user_id = ? AND title_id = ? FOR UPDATE',
                [userId, titleId]
            );
            if (!existing.length) return null;

            await conn.query('DELETE FROM ratings WHERE id = ?', [existing[0].id]);
            const stats = await recomputeAggregate(conn, titleId, minVotes, fallbackPrior);
            return { ratingId: existing[0].id, stats };
        }, { isolation: 'READ COMMITTED' });
    }

    static async currentPriorMean(fallback) {
        const [rows] = await db.query(
            'SELECT COALESCE(SUM(rating_sum), 0) AS s, COALESCE(SUM(rating_count), 0) AS c FROM aggregates'
        );
        const count = Number(rows[0].c);
        return count > 0 ? round(Number(rows[0].s) / count, 4) : fallback;
    }
}

module.exports = RatingRepository;
