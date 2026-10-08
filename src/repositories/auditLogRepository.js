// src/repositories/auditLogRepository.js
const db = require('../config/database');

// Bảng users dùng cột full_name (không có cột username)
const SELECT_LOGS_SQL = `
    SELECT a.*, u.full_name
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
`;

const COUNT_LOGS_SQL = 'SELECT COUNT(*) AS total FROM audit_logs';

class AuditLogRepository {
    /**
     * Lấy một trang nhật ký hệ thống, kèm tên người thực hiện (nếu còn tồn tại).
     * @param {number} limit
     * @param {number} offset
     * @returns {Promise<Array>}
     */
    static async findPaginated(limit, offset) {
        const [rows] = await db.query(SELECT_LOGS_SQL, [limit, offset]);

        return rows;
    }

    /**
     * Đếm tổng số bản ghi nhật ký để phục vụ phân trang.
     * @returns {Promise<number>}
     */
    static async countAll() {
        const [rows] = await db.query(COUNT_LOGS_SQL);

        return rows[0].total;
    }
}

module.exports = AuditLogRepository;
