'use strict';
const RatingService = require('../services/ratingService');

class RatingController {
    static async getMine(req, res, next) {
        try {
            const data = await RatingService.getMine(req.user, req.params.id);
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    }

    static async upsert(req, res, next) {
        try {
            const { created, data } = await RatingService.upsert(req.user, req.params.id, req.body, req.ip);
            res.status(created ? 201 : 200).json({
                success: true,
                message: created ? 'Đã ghi nhận đánh giá' : 'Đã cập nhật đánh giá',
                data
            });
        } catch (error) { next(error); }
    }

    static async remove(req, res, next) {
        try {
            const data = await RatingService.remove(req.user, req.params.id, req.ip);
            res.status(200).json({ success: true, message: 'Đã xóa đánh giá', data });
        } catch (error) { next(error); }
    }
}

module.exports = RatingController;
