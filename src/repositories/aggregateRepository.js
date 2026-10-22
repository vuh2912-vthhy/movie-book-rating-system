'use strict';
const db = require('../config/database');
const { withTransaction } = require('../utils/transaction');

class AggregateRepository {
    static async lock(conn, titleId) {
        const [rows] = await conn.query('SELECT title_id FROM aggregates WHERE title_id = ? FOR UPDATE', [titleId]);
        return rows.length > 0;
    }

    static async recountReviews(conn, titleId) {
        await conn.query(
            `UPDATE aggregates
             SET review_count = (SELECT COUNT(*) FROM reviews v WHERE v.title_id = ? AND v.status = 'approved'),
                 updated_at = UTC_TIMESTAMP()
             WHERE title_id = ?`,
            [titleId, titleId]
        );
    }

    static async findMismatches() {
        const [rows] = await db.query(
            `SELECT a.title_id, a.rating_count, COALESCE(x.c, 0) AS actual_count,
                    a.rating_sum, COALESCE(x.s, 0) AS actual_sum,
                    a.review_count,
                    (SELECT COUNT(*) FROM reviews v WHERE v.title_id = a.title_id AND v.status = 'approved') AS actual_reviews
             FROM aggregates a
             LEFT JOIN (SELECT title_id, COUNT(*) AS c, SUM(score) AS s FROM ratings GROUP BY title_id) x
                    ON x.title_id = a.title_id
             WHERE a.rating_count <> COALESCE(x.c, 0)
                OR a.rating_sum <> COALESCE(x.s, 0)
                OR a.review_count <> (SELECT COUNT(*) FROM reviews v WHERE v.title_id = a.title_id AND v.status = 'approved')
             ORDER BY a.title_id ASC`
        );
        return rows;
    }

    static async rebuildAll(minVotes, fallbackPrior) {
        return withTransaction(async (conn) => {
            const [g] = await conn.query('SELECT COUNT(*) AS c, COALESCE(SUM(score), 0) AS s FROM ratings');
            const prior = Number(g[0].c) > 0 ? Number(g[0].s) / Number(g[0].c) : fallbackPrior;
            await conn.query(
                `UPDATE aggregates
                 SET rating_count = (SELECT COUNT(*) FROM ratings r WHERE r.title_id = aggregates.title_id),
                     rating_sum = (SELECT COALESCE(SUM(r.score), 0) FROM ratings r WHERE r.title_id = aggregates.title_id),
                     rating_avg = (SELECT ROUND(AVG(r.score), 2) FROM ratings r WHERE r.title_id = aggregates.title_id),
                     review_count = (SELECT COUNT(*) FROM reviews v
                                     WHERE v.title_id = aggregates.title_id AND v.status = 'approved')`
            );
            await conn.query(
                `UPDATE aggregates
                 SET weighted_score = ROUND((rating_sum + ? * ?) / (rating_count + ?), 4),
                     updated_at = UTC_TIMESTAMP()`,
                [minVotes, prior, minVotes]
            );
            const [total] = await conn.query('SELECT COUNT(*) AS n FROM aggregates');
            return { titles: Number(total[0].n), priorMean: Number(prior.toFixed(4)) };
        });
    }
}

module.exports = AggregateRepository;
