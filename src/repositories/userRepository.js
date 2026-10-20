'use strict';
// Tầng truy cập dữ liệu: chỉ chứa truy vấn SQL tham số hóa (dấu ?), không có nghiệp vụ.
const db = require('../config/database');
const { withTransaction } = require('../utils/transaction');
const { escapeLike } = require('../utils/text');

const AUTH_CONTEXT_SQL = `
    SELECT u.id, u.email, u.full_name, u.display_name, u.status, u.token_version,
           r.code AS role_code, p.code AS permission_code
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE u.id = ?`;

class UserRepository {
    // Dùng cho đăng nhập: kèm cờ "đang bị khóa tạm" tính ngay trong CSDL (UTC).
    static async findByEmail(email) {
        const [rows] = await db.query(
            `SELECT id, email, password_hash, full_name, display_name, status, failed_login_count, token_version,
                    (locked_until IS NOT NULL AND locked_until > UTC_TIMESTAMP()) AS is_temp_locked
             FROM users WHERE email = ? LIMIT 1`,
            [email]
        );
        return rows.length ? rows[0] : null;
    }

    // Dùng cho mọi yêu cầu có xác thực: trạng thái tài khoản + vai trò + quyền, một truy vấn.
    static async findAuthContextById(userId) {
        const [rows] = await db.query(AUTH_CONTEXT_SQL, [userId]);
        if (!rows.length) return null;

        const roles = new Set();
        const permissions = new Set();
        rows.forEach((row) => {
            if (row.role_code) roles.add(row.role_code);
            if (row.permission_code) permissions.add(row.permission_code);
        });

        return {
            id: rows[0].id,
            email: rows[0].email,
            fullName: rows[0].full_name,
            displayName: rows[0].display_name,
            status: rows[0].status,
            tokenVersion: Number(rows[0].token_version),
            roles: [...roles],
            permissions: [...permissions]
        };
    }

    // Tạo tài khoản và gán vai trò trong một giao dịch: hoặc cả hai thành công, hoặc không gì cả.
    static async createWithRole({ email, passwordHash, fullName, displayName, roleCode }) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [created] = await conn.query(
                'INSERT INTO users (email, password_hash, full_name, display_name) VALUES (?, ?, ?, ?)',
                [email, passwordHash, fullName, displayName]
            );
            const [assigned] = await conn.query(
                'INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?',
                [created.insertId, roleCode]
            );
            if (assigned.affectedRows !== 1) {
                throw new Error(`Vai trò ${roleCode} chưa có trong bảng roles`);
            }
            await conn.commit();
            return created.insertId;
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    }

    // Tăng bộ đếm đăng nhập sai; khi đạt ngưỡng thì khóa tạm và đặt lại bộ đếm.
    // Thứ tự gán trong SET quan trọng: locked_until đọc giá trị cũ của failed_login_count.
    static async registerFailedLogin(userId, maxAttempts, lockMinutes) {
        await db.query(
            `UPDATE users
             SET locked_until = IF(failed_login_count + 1 >= ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE), locked_until),
                 failed_login_count = IF(failed_login_count + 1 >= ?, 0, failed_login_count + 1)
             WHERE id = ?`,
            [maxAttempts, lockMinutes, maxAttempts, userId]
        );
        const [rows] = await db.query(
            'SELECT (locked_until IS NOT NULL AND locked_until > UTC_TIMESTAMP()) AS locked FROM users WHERE id = ?',
            [userId]
        );
        return rows.length ? Boolean(rows[0].locked) : false;
    }

    static async recordSuccessfulLogin(userId) {
        await db.query(
            'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP() WHERE id = ?',
            [userId]
        );
    }

    // Thu hồi MỌI token đã cấp (đăng xuất, khóa tài khoản, đổi mật khẩu) bằng cách tăng số phiên bản.
    // Không dùng thời gian nên không có kẽ hở "cùng giây" như so sánh iat.
    static async revokeTokens(userId) {
        await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [userId]);
    }

    static async hasRole(userId, roleCode) {
        if (!userId || !roleCode) return false;
        const [rows] = await db.query(
            `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = ? AND r.code = ? LIMIT 1`,
            [userId, roleCode]
        );
        return rows.length > 0;
    }

    // ---- Hồ sơ, mật khẩu ----
    static async findPasswordHashById(userId) {
        const [rows] = await db.query('SELECT id, password_hash FROM users WHERE id = ? LIMIT 1', [userId]);
        return rows[0] || null;
    }

    // Đổi mật khẩu: tăng token_version để mọi thẻ cũ mất hiệu lực ngay, xóa trạng thái khóa tạm.
    static async updatePassword(userId, passwordHash) {
        const [res] = await db.query(
            `UPDATE users SET password_hash = ?, token_version = token_version + 1,
                    failed_login_count = 0, locked_until = NULL WHERE id = ?`, [passwordHash, userId]);
        return res.affectedRows;
    }

    static async updateProfile(userId, { fullName, displayName }) {
        const [res] = await db.query(
            'UPDATE users SET full_name = COALESCE(?, full_name), display_name = COALESCE(?, display_name) WHERE id = ?',
            [fullName === undefined ? null : fullName, displayName === undefined ? null : displayName, userId]);
        return res.affectedRows;
    }

    static async findActiveByEmail(email) {
        const [rows] = await db.query("SELECT id, email FROM users WHERE email = ? AND status = 'active' LIMIT 1", [email]);
        return rows[0] || null;
    }

    // ---- Quản trị người dùng ----
    static async listPaginated({ q, status, role }, limit, offset) {
        const where = []; const params = [];
        if (q) {
            where.push('(u.email LIKE ? OR u.full_name LIKE ? OR u.display_name LIKE ?)');
            const like = `%${escapeLike(q)}%`; params.push(like, like, like);
        }
        if (status) { where.push('u.status = ?'); params.push(status); }
        if (role) {
            where.push('EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = ?)');
            params.push(role);
        }
        const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';   // chỉ ghép đoạn cố định, giá trị đi qua ?
        const [rows] = await db.query(
            `SELECT u.id, u.email, u.full_name, u.display_name, u.status, u.created_at, u.last_login_at,
                    (SELECT GROUP_CONCAT(r.code ORDER BY r.code) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
               FROM users u ${clause} ORDER BY u.id ASC LIMIT ? OFFSET ?`, [...params, limit, offset]);
        const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM users u ${clause}`, params);
        return { rows, total: count.total };
    }

    static async findSummaryById(id) {
        const [rows] = await db.query(
            `SELECT u.id, u.email, u.full_name, u.display_name, u.status, u.created_at, u.last_login_at,
                    (SELECT GROUP_CONCAT(r.code ORDER BY r.code) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
               FROM users u WHERE u.id = ? LIMIT 1`, [id]);
        return rows[0] || null;
    }

    // Khóa/mở khóa: tăng token_version để thẻ đang dùng mất hiệu lực ngay.
    static async setStatus(id, status) {
        const [res] = await db.query(
            'UPDATE users SET status = ?, token_version = token_version + 1, failed_login_count = 0, locked_until = NULL WHERE id = ?', [status, id]);
        return res.affectedRows;
    }

    // Đổi vai trò trong một giao dịch; không cho ADMIN cuối cùng bị hạ quyền.
    static async replaceRole(userId, roleCode) {
        return withTransaction(async (conn) => {
            const [locked] = await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
            if (!locked.length) return { notFound: true };
            const [isAdmin] = await conn.query(
                "SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.code = 'ADMIN'", [userId]);
            if (isAdmin.length && roleCode !== 'ADMIN') {
                const [others] = await conn.query(
                    `SELECT COUNT(*) AS n FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id
                      WHERE r.code = 'ADMIN' AND ur.user_id <> ? AND u.status = 'active' FOR UPDATE`, [userId]);
                if (!others[0].n) return { lastAdmin: true };
            }
            await conn.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
            const [ins] = await conn.query('INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [userId, roleCode]);
            if (ins.affectedRows !== 1) throw new Error('Vai trò không tồn tại trong CSDL');
            return { ok: true };
        });
    }
}

module.exports = UserRepository;
