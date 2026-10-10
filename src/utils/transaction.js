'use strict';
const db = require('../config/database');

const ISOLATION = new Set(['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']);

/**
 * Chạy `work(conn)` trong một giao dịch: thành công thì COMMIT, có lỗi thì ROLLBACK rồi ném lại lỗi.
 * Dùng READ COMMITTED cho các thao tác "khóa dòng rồi tính lại" để mỗi câu lệnh đọc dữ liệu
 * đã chốt mới nhất sau khi giành được khóa.
 */
async function withTransaction(work, { isolation } = {}) {
    if (isolation && !ISOLATION.has(isolation)) throw new Error(`Mức cô lập không hợp lệ: ${isolation}`);
    const conn = await db.getConnection();
    try {
        if (isolation) await conn.query(`SET TRANSACTION ISOLATION LEVEL ${isolation}`);
        await conn.beginTransaction();
        const result = await work(conn);
        await conn.commit();
        return result;
    } catch (error) {
        try {
            await conn.rollback();
        } catch (rollbackError) {
            console.error('[tx] Không rollback được:', rollbackError.code || rollbackError.message);
        }
        throw error;
    } finally {
        conn.release();
    }
}

module.exports = { withTransaction };
