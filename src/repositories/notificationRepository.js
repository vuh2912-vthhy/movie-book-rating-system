'use strict';
const db = require('../config/database');

class NotificationRepository {
    static async insertMany(rows) {
        if (!rows.length) return;
        await db.query(
            'INSERT INTO notifications (user_id, type, message, entity, entity_id) VALUES ?',
            [rows.map((r) => [r.userId, r.type, r.message, r.entity || null, r.entityId || null])]
        );
    }

    static async list(userId, unreadOnly, limit, offset) {
        const [rows] = await db.query(
            `SELECT id, type, message, entity, entity_id, is_read, created_at
             FROM notifications
             WHERE user_id = ?${unreadOnly ? ' AND is_read = 0' : ''}
             ORDER BY created_at DESC, id DESC
             LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );
        return rows;
    }

    static async count(userId, unreadOnly) {
        const [rows] = await db.query(
            `SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?${unreadOnly ? ' AND is_read = 0' : ''}`,
            [userId]
        );
        return Number(rows[0].total);
    }

    // Điều kiện user_id nằm ngay trong câu lệnh: không đọc/sửa được thông báo của người khác (chống IDOR)
    static async markRead(id, userId) {
        const [result] = await db.query('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, userId]);
        return result.affectedRows > 0;
    }

    static async exists(id, userId) {
        const [rows] = await db.query('SELECT 1 FROM notifications WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
        return rows.length > 0;
    }

    static async markAllRead(userId) {
        const [result] = await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);
        return result.affectedRows;
    }
}

module.exports = NotificationRepository;
