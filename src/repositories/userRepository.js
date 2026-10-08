// src/repositories/userRepository.js
const db = require('../config/database');

class UserRepository {
    /**
     * Tìm ID người dùng theo email.
     * Token hiện chỉ chứa email nên cần tra ngược ra ID để kiểm tra quyền.
     * @param {string} email
     * @returns {Promise<number|null>}
     */
    static async findIdByEmail(email) {
        if (!email) return null;

        const [rows] = await db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);

        return rows.length > 0 ? rows[0].id : null;
    }

    /**
     * Kiểm tra người dùng có vai trò tương ứng trong bảng RBAC hay không.
     * @param {number} userId
     * @param {string} roleCode - Mã vai trò, ví dụ 'admin'
     * @returns {Promise<boolean>}
     */
    static async hasRole(userId, roleCode) {
        if (!userId || !roleCode) return false;

        const [rows] = await db.query(
            `SELECT 1
             FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = ? AND r.code = ?
             LIMIT 1`,
            [userId, roleCode]
        );

        return rows.length > 0;
    }
}

module.exports = UserRepository;
