'use strict';
const ReviewService = require('../services/reviewService');
const VoteService = require('../services/voteService');
const ReportService = require('../services/reportService');

class ReviewController {
    static async listPublic(req, res, next) {
        try {
            const { items, pagination } = await ReviewService.listPublic(req.params.id, req.query, req.user);
            res.status(200).json({ success: true, data: items, pagination });
        } catch (error) { next(error); }
    }

    static async getMine(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await ReviewService.getMine(req.user, req.params.id) });
        } catch (error) { next(error); }
    }

    static async create(req, res, next) {
        try {
            const data = await ReviewService.create(req.user, req.params.id, req.body, req.ip);
            res.status(201).json({ success: true, message: 'Đã gửi bình luận, đang chờ duyệt', data });
        } catch (error) { next(error); }
    }

    static async updateMine(req, res, next) {
        try {
            const data = await ReviewService.updateMine(req.user, req.params.id, req.body, req.ip);
            res.status(200).json({ success: true, message: 'Đã cập nhật bình luận, đang chờ duyệt lại', data });
        } catch (error) { next(error); }
    }

    static async removeMine(req, res, next) {
        try {
            const data = await ReviewService.removeMine(req.user, req.params.id, req.ip);
            res.status(200).json({ success: true, message: 'Đã xóa bình luận', data });
        } catch (error) { next(error); }
    }

    static async setVote(req, res, next) {
        try {
            const { created, data } = await VoteService.set(req.user, req.params.id, req.body);
            res.status(created ? 201 : 200).json({ success: true, message: 'Đã ghi nhận bình chọn', data });
        } catch (error) { next(error); }
    }

    static async removeVote(req, res, next) {
        try {
            const data = await VoteService.remove(req.user, req.params.id);
            res.status(200).json({ success: true, message: 'Đã bỏ bình chọn', data });
        } catch (error) { next(error); }
    }

    static async report(req, res, next) {
        try {
            const data = await ReportService.create(req.user, req.params.id, req.body, req.ip);
            res.status(201).json({ success: true, message: 'Đã gửi báo cáo', data });
        } catch (error) { next(error); }
    }
}

module.exports = ReviewController;
