'use strict';
const HttpError = require('../utils/httpError');
const { parseId } = require('../utils/params');
const { validateReport } = require('../utils/reviewValidators');
const ReviewRepository = require('../repositories/reviewRepository');
const ReportRepository = require('../repositories/reportRepository');
const AuditLogService = require('./auditLogService');

class ReportService {
    static async create(user, reviewIdRaw, body, ip) {
        const reviewId = parseId(reviewIdRaw);
        const { errors, value } = validateReport(body);
        if (errors.length) throw HttpError.unprocessable('Báo cáo không hợp lệ', errors);

        const review = await ReviewRepository.findById(reviewId);
        if (!review || review.status !== 'approved') throw HttpError.notFound('Không tìm thấy bình luận', 'REVIEW_NOT_FOUND');
        if (review.user_id === user.id) throw HttpError.forbidden('Không thể báo cáo bình luận của chính mình', 'OWN_REVIEW');

        let id;
        try {
            id = await ReportRepository.create({ reviewId, reporterId: user.id, reason: value.reason, detail: value.detail });
        } catch (error) {
            if (error && error.code === 'ER_DUP_ENTRY') {
                throw HttpError.conflict('Bạn đã báo cáo bình luận này', 'REPORT_EXISTS');
            }
            throw error;
        }
        await AuditLogService.logAction(user.id, 'REPORT_CREATE', 'reports', id, ip);
        return { id, status: 'open' };
    }
}

module.exports = ReportService;
