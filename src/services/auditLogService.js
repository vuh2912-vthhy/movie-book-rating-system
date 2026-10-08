const db = require('../config/database');

class AuditLogService {
    /**
     * Ghi nhật ký hệ thống
     * @param {number} userId - ID người dùng thực hiện (null nếu khách)
     * @param {string} action - 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'CHANGE_ROLE', 'DELETE_REVIEW'
     * @param {string} entity - Tên bảng bị tác động (VD: 'Reviews', 'users')
     * @param {number} entityId - ID của bản ghi bị tác động
     * @param {object} req - Object request của Express để lấy IP
     */
    static async logAction(userId, action, entity, entityId = null, req = {}) {
        try {
            const ipAddress = req.ip || req.connection?.remoteAddress || null;

            const sql = `
                INSERT INTO audit_logs (user_id, action, entity, entity_id, ip)
                VALUES (?, ?, ?, ?, ?)
            `;
            // Cấu trúc biến phải khớp chính xác thứ tự với INSERT INTO
            const params = [userId, action, entity, entityId, ipAddress];
            
            await db.execute(sql, params);
        } catch (error) {
            console.error("LỖI GHI LOG HỆ THỐNG:", error.message);
            // Không throw error để tránh chặn luồng nghiệp vụ chính của người dùng
        }
    }
}

module.exports = AuditLogService;