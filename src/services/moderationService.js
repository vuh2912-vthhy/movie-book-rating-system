'use strict';
const HttpError = require('../utils/httpError');
const { parseId, parsePagination, buildPagination, invalid } = require('../utils/params');
const { validateModerate, validateHandle, validateEnumQuery, REVIEW_STATUSES, REPORT_STATUSES } = require('../utils/reviewValidators');
const ReviewRepository = require('../repositories/reviewRepository');
const ReportRepository = require('../repositories/reportRepository');
const AuditLogService = require('./auditLogService');
const NotificationService = require('./notificationService');

const ACTION_AUDIT = { approve: 'REVIEW_APPROVE', reject: 'REVIEW_REJECT', hide: 'REVIEW_HIDE', restore: 'REVIEW_RESTORE' };

const reviewMessage = (action, titleName, note) => {
    if (action === 'approve') return `Bình luận của bạn về “${titleName}” đã được duyệt.`;
    if (action === 'restore') return `Bình luận của bạn về “${titleName}” đã được khôi phục.`;
    if (action === 'reject') return `Bình luận của bạn về “${titleName}” bị từ chối.${note ? ` Lý do: ${note}` : ''}`;
    return `Bình luận của bạn về “${titleName}” đã bị ẩn do vi phạm quy định.`;
};

class ModerationService {
    static async listReviews(query) {
        const status = validateEnumQuery(query, 'status', REVIEW_STATUSES, 'pending');
        if (status.error) throw HttpError.unprocessable('Tham số không hợp lệ', [status.error]);
        const paging = parsePagination(query, { defaultSize: 20, maxSize: 50 });
        const [rows, total] = await Promise.all([
            ReviewRepository.listForModeration(status.value, paging.size, paging.offset),
            ReviewRepository.countForModeration(status.value)
        ]);
        return {
            items: rows.map((r) => ({
                id: r.id, body: r.body, status: r.status, titleId: r.title_id, titleCode: r.title_code, titleName: r.title_name,
                authorName: r.author_name, openReports: Number(r.open_reports), createdAt: r.created_at, moderatedAt: r.moderated_at || null
            })),
            pagination: buildPagination(paging, total)
        };
    }

    static async moderate(user, reviewIdRaw, body, ip) {
        const reviewId = parseId(reviewIdRaw);
        const { errors, value } = validateModerate(body);
        if (errors.length) throw HttpError.unprocessable('Yêu cầu duyệt không hợp lệ', errors);

        const result = await ReviewRepository.moderate({ reviewId, action: value.action, moderatorId: user.id });
        if (result.notFound) throw HttpError.notFound('Không tìm thấy bình luận', 'REVIEW_NOT_FOUND');
        if (result.invalid) {
            // QTNV-08: phép chuyển không có trong sơ đồ trạng thái bị từ chối
            throw HttpError.unprocessable('Không thể thực hiện thao tác này với bình luận ở trạng thái hiện tại', [
                invalid('action', `Không thể "${value.action}" bình luận đang ở trạng thái "${result.from}"`, 'INVALID_TRANSITION')
            ], 'INVALID_TRANSITION');
        }

        await AuditLogService.logAction(user.id, ACTION_AUDIT[value.action], 'reviews', reviewId, ip);
        await NotificationService.notify([{
            userId: result.authorId,
            type: value.action === 'reject' ? 'REVIEW_REJECTED' : value.action === 'hide' ? 'REVIEW_HIDDEN' : 'REVIEW_APPROVED',
            message: reviewMessage(value.action, result.titleName, value.note),
            entity: 'reviews', entityId: reviewId
        }]);
        return { id: reviewId, status: result.to, previousStatus: result.from };
    }

    static async listReports(query) {
        const status = validateEnumQuery(query, 'status', REPORT_STATUSES, 'open');
        if (status.error) throw HttpError.unprocessable('Tham số không hợp lệ', [status.error]);
        const paging = parsePagination(query, { defaultSize: 20, maxSize: 50 });
        const [rows, total] = await Promise.all([
            ReportRepository.listForModeration(status.value, paging.size, paging.offset),
            ReportRepository.countForModeration(status.value)
        ]);
        return {
            items: rows.map((r) => ({
                id: r.id, reviewId: r.review_id, reason: r.reason, detail: r.detail, status: r.status,
                reporterName: r.reporter_name, createdAt: r.created_at, handledAt: r.handled_at || null,
                review: { body: r.review_body, status: r.review_status, authorName: r.author_name },
                title: { id: r.title_id, code: r.title_code, name: r.title_name }
            })),
            pagination: buildPagination(paging, total)
        };
    }

    static async handleReport(user, reportIdRaw, body, ip) {
        const reportId = parseId(reportIdRaw);
        const { errors, value } = validateHandle(body);
        if (errors.length) throw HttpError.unprocessable('Yêu cầu xử lý không hợp lệ', errors);

        const result = await ReportRepository.handle({ reportId, decision: value.decision, handlerId: user.id });
        if (result.notFound) throw HttpError.notFound('Không tìm thấy báo cáo', 'REPORT_NOT_FOUND');
        if (result.closed) throw HttpError.unprocessable('Báo cáo này đã được xử lý', [invalid('report', 'Báo cáo không còn ở trạng thái mở', 'REPORT_CLOSED')], 'REPORT_CLOSED');

        await AuditLogService.logAction(user.id, value.decision === 'resolve' ? 'REPORT_RESOLVE' : 'REPORT_DISMISS', 'reports', reportId, ip);
        const notes = [];
        if (result.hidden) {
            await AuditLogService.logAction(user.id, 'REVIEW_HIDE', 'reviews', result.review.id, ip);
            notes.push({ userId: result.review.authorId, type: 'REVIEW_HIDDEN', message: reviewMessage('hide', result.review.titleName), entity: 'reviews', entityId: result.review.id });
        }
        const reporterMessage = value.decision === 'resolve'
            ? 'Báo cáo của bạn đã được xử lý: bình luận vi phạm đã được ẩn.'
            : 'Báo cáo của bạn đã được xem xét: bình luận không vi phạm quy định.';
        result.reporterIds.forEach((uid) => notes.push({ userId: uid, type: 'REPORT_HANDLED', message: reporterMessage, entity: 'reports', entityId: reportId }));
        await NotificationService.notify(notes);

        return { id: reportId, decision: value.decision, reviewHidden: result.hidden, reviewStatus: result.review.status };
    }
}

module.exports = ModerationService;
