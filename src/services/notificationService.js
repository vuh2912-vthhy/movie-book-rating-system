'use strict';
const HttpError = require('../utils/httpError');
const { parseId, parsePagination, buildPagination } = require('../utils/params');
const { validateBoolQuery } = require('../utils/reviewValidators');
const NotificationRepository = require('../repositories/notificationRepository');

const toApi = (n) => ({
    id: n.id, type: n.type, message: n.message, entity: n.entity, entityId: n.entity_id,
    isRead: Boolean(n.is_read), createdAt: n.created_at
});

class NotificationService {
    // Ghi thông báo theo kiểu "cố gắng hết sức": lỗi không làm hỏng nghiệp vụ đã hoàn tất
    static async notify(rows) {
        try {
            await NotificationRepository.insertMany(rows);
        } catch (error) {
            console.error('[notify] Không ghi được thông báo:', error.code || error.message);
        }
    }

    static async listMine(user, query) {
        const unread = validateBoolQuery(query, 'unread');
        if (unread.error) throw HttpError.unprocessable('Tham số không hợp lệ', [unread.error]);
        const paging = parsePagination(query, { defaultSize: 20, maxSize: 50 });
        const [rows, total, unreadCount] = await Promise.all([
            NotificationRepository.list(user.id, unread.value, paging.size, paging.offset),
            NotificationRepository.count(user.id, unread.value),
            NotificationRepository.count(user.id, true)
        ]);
        return { items: rows.map(toApi), pagination: buildPagination(paging, total), unreadCount };
    }

    static async markRead(user, idRaw) {
        const id = parseId(idRaw);
        // Không phân biệt "không tồn tại" và "của người khác": cùng trả 404
        if (!(await NotificationRepository.exists(id, user.id))) {
            throw HttpError.notFound('Không tìm thấy thông báo', 'NOTIFICATION_NOT_FOUND');
        }
        await NotificationRepository.markRead(id, user.id);
        return { id, isRead: true };
    }

    static async markAllRead(user) {
        const updated = await NotificationRepository.markAllRead(user.id);
        return { updated };
    }
}

module.exports = NotificationService;
