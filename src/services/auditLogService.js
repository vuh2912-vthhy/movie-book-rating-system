'use strict';
const AuditLogRepository = require('../repositories/auditLogRepository');

// Chấp nhận chuỗi IP, hoặc (tương thích mã cũ) đối tượng request của Express.
const normalizeIp = (ip) => {
    const raw = typeof ip === 'string' ? ip : ip && typeof ip.ip === 'string' ? ip.ip : null;
    if (!raw) return null;
    return raw.trim().replace(/^::ffff:/, '').slice(0, 45) || null;
};

class AuditLogService {
    /**
     * Ghi nhật ký hành vi nhạy cảm. Không bao giờ ném lỗi ra ngoài để không làm hỏng nghiệp vụ chính.
     * @param {number|null} userId  người thực hiện (null nếu khách / hệ thống)
     * @param {string} action       ví dụ LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, REGISTER, ACCOUNT_LOCKED
     * @param {string} entity       tên bảng bị tác động, ví dụ 'users'
     * @param {number|null} entityId
     * @param {string|object|null} ip
     */
    static async logAction(userId, action, entity, entityId = null, ip = null) {
        try {
            await AuditLogRepository.insert({
                userId: userId || null,
                action,
                entity,
                entityId: entityId || null,
                ip: normalizeIp(ip)
            });
        } catch (error) {
            console.error('[audit] Không ghi được nhật ký:', error.code || error.message);
        }
    }
}

module.exports = AuditLogService;
