'use strict';
// Luồng nghiệp vụ T5: chấm điểm + cập nhật bảng tổng hợp trong MỘT giao dịch.
//
// Chống mất cập nhật khi nhiều người chấm cùng lúc:
//   1) Khóa dòng aggregates của tác phẩm (SELECT ... FOR UPDATE): các lần chấm cùng tác phẩm xếp hàng.
//   2) Khóa dòng ratings của (user, title): hai yêu cầu cùng người dùng không tạo bản ghi trùng.
//   3) Tính lại COUNT/SUM từ bảng ratings (nguồn sự thật), không cộng dồn "lệch" ở tầng ứng dụng.
const db = require('../config/database');
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

// Tính lại dòng tổng hợp của MỘT tác phẩm (phải gọi khi đang giữ khóa dòng aggregates)
async function recomputeAggregate(conn, titleId, minVotes, fallbackPrior) {
    const [rows] = await conn.query(
        'SELECT COUNT(*) AS c, COALESCE(SUM(score), 0) AS s FROM ratings WHERE title_id = ?',
        [titleId]
    );
    const count = Number(rows[0].c);
    const sum = Number(rows[0].s);
    const prior = await priorMeanFromAggregates(conn, fallbackPrior);
    // Trung bình làm tròn 2 chữ số theo kiểu ROUND() của MySQL (0,5 làm tròn lên), tính bằng số nguyên để không sai số dấu phẩy động
    const average = count > 0 ? Math.floor((sum * 200 + count) / (count * 2)) / 100 : null;
    const weighted = round((sum + minVotes * prior) / (count + minVotes), 4);

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

    // Trả về null nếu tác phẩm chưa có dòng tổng hợp (không tồn tại)
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

    // Trả về null nếu người dùng chưa chấm tác phẩm này
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
