'use strict';
const db = require('../config/database');

// Ghép điều kiện lọc từ bộ lọc đã được kiểm tra; mọi giá trị đi qua tham số `?`
function buildWhere(filters = {}) {
    const clauses = [];
    const params = [];
    if (filters.userId) { clauses.push('a.user_id = ?'); params.push(filters.userId); }
    if (filters.action) { clauses.push('a.action = ?'); params.push(filters.action); }
    if (filters.entity) { clauses.push('a.entity = ?'); params.push(filters.entity); }
    if (filters.ip) { clauses.push('a.ip = ?'); params.push(filters.ip); }
    if (filters.from) { clauses.push('a.created_at >= ?'); params.push(filters.from); }
    if (filters.to) { clauses.push('a.created_at <= ?'); params.push(filters.to); }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

class AuditLogRepository {
    static async insert({ userId, action, entity, entityId, ip }) {
        await db.query(
            'INSERT INTO audit_logs (user_id, action, entity, entity_id, ip) VALUES (?, ?, ?, ?, ?)',
            [userId, action, entity, entityId, ip]
        );
    }

    // Sắp xếp theo (created_at, id) để các trang không bị lặp hoặc sót bản ghi cùng thời điểm
    static async findPaginated(filters, limit, offset) {
        const { where, params } = buildWhere(filters);
        const [rows] = await db.query(
            `SELECT a.*, u.full_name
             FROM audit_logs a
             LEFT JOIN users u ON a.user_id = u.id
             ${where}
             ORDER BY a.created_at DESC, a.id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        return rows;
    }

    static async countAll(filters) {
        const { where, params } = buildWhere(filters);
        const [rows] = await db.query(`SELECT COUNT(*) AS total FROM audit_logs a ${where}`, params);
        return Number(rows[0].total);
    }

    static async distinctActions() {
        const [rows] = await db.query('SELECT DISTINCT action FROM audit_logs ORDER BY action ASC');
        return rows.map((r) => r.action);
    }
}

module.exports = AuditLogRepository;
