'use strict';
const { withTransaction } = require('../utils/transaction');

class PasswordResetRepository {
    static async create(userId, tokenHash, ttlMinutes) {
        return withTransaction(async (conn) => {
            await conn.query('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [userId]);
            await conn.query(
                'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))',
                [userId, tokenHash, ttlMinutes]);
        });
    }

    static async consumeAndSetPassword(tokenHash, passwordHash) {
        return withTransaction(async (conn) => {
            const [rows] = await conn.query(
                'SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() FOR UPDATE',
                [tokenHash]);
            if (!rows.length) return null;
            await conn.query('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE id = ?', [rows[0].id]);
            await conn.query(
                `UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_login_count = 0, locked_until = NULL
                  WHERE id = ?`, [passwordHash, rows[0].user_id]);
            return rows[0].user_id;
        });
    }
}

module.exports = PasswordResetRepository;
