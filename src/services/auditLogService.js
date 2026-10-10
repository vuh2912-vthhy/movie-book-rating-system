'use strict';
const AuditLogRepository = require('../repositories/auditLogRepository');
const { parsePagination, buildPagination } = require('../utils/params');

// Chấp nhận chuỗi IP, hoặc (tương thích mã cũ) đối tượng request của Express.
const normalizeIp = (ip) => {
    const raw = typeof ip === 'string' ? ip : ip && typeof ip.ip === 'string' ? ip.ip : null;
    if (!raw) return null;
    return raw.trim().replace(/^::ffff:/, '').slice(0, 45) || null;
};

const toApi = (row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.full_name || null,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    ip: row.ip,
    createdAt: row.created_at
});

class AuditLogService {
    /**
     * Ghi nhật ký hành vi nhạy cảm. Không bao giờ ném lỗi ra ngoài để không làm hỏng nghiệp vụ chính.
     * @param {number|null} userId  người thực hiện (null nếu khách / hệ thống)
     * @param {string} action       ví dụ LOGIN_SUCCESS, TITLE_CREATE, RATING_UPSERT
     * @param {string} entity       tên bảng bị tác động, ví dụ 'titles'
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

    // Tra cứu nhật ký (cho quản trị viên), có phân trang
    static async list(query) {
        const paging = parsePagination(query, { defaultSize: 20, maxSize: 100 });
        const [rows, total] = await Promise.all([
            AuditLogRepository.findPaginated(paging.size, paging.offset),
            AuditLogRepository.countAll()
        ]);
        return { items: rows.map(toApi), pagination: buildPagination(paging, Number(total)) };
    }
}

module.exports = AuditLogService;
