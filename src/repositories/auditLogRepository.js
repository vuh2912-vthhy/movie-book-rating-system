'use strict';
const db = require('../config/database');

// Sắp xếp theo (created_at, id) để các trang không bị lặp hoặc sót bản ghi cùng thời điểm.
const SELECT_LOGS_SQL = `
    SELECT a.*, u.full_name
    FROM audit_logs a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ? OFFSET ?
`;

class AuditLogRepository {
    static async insert({ userId, action, entity, entityId, ip }) {
        await db.query(
            'INSERT INTO audit_logs (user_id, action, entity, entity_id, ip) VALUES (?, ?, ?, ?, ?)',
            [userId, action, entity, entityId, ip]
        );
    }

    static async findPaginated(limit, offset) {
        const [rows] = await db.query(SELECT_LOGS_SQL, [limit, offset]);
        return rows;
    }

    static async countAll() {
        const [rows] = await db.query('SELECT COUNT(*) AS total FROM audit_logs');
        return rows[0].total;
    }
}

module.exports = AuditLogRepository;
