'use strict';
const ModerationService = require('../services/moderationService');

class ModerationController {
    static async listReviews(req, res, next) {
        try {
            const { items, pagination } = await ModerationService.listReviews(req.query);
            res.status(200).json({ success: true, data: items, pagination });
        } catch (error) { next(error); }
    }

    static async moderate(req, res, next) {
        try {
            const data = await ModerationService.moderate(req.user, req.params.id, req.body, req.ip);
            res.status(200).json({ success: true, message: 'Đã cập nhật trạng thái bình luận', data });
        } catch (error) { next(error); }
    }

    static async listReports(req, res, next) {
        try {
            const { items, pagination } = await ModerationService.listReports(req.query);
            res.status(200).json({ success: true, data: items, pagination });
        } catch (error) { next(error); }
    }

    static async handleReport(req, res, next) {
        try {
            const data = await ModerationService.handleReport(req.user, req.params.id, req.body, req.ip);
            res.status(200).json({ success: true, message: 'Đã xử lý báo cáo', data });
        } catch (error) { next(error); }
    }
}

module.exports = ModerationController;
