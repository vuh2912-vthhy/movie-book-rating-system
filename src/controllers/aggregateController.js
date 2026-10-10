'use strict';
const AggregateService = require('../services/aggregateService');

class AggregateController {
    static async reconcile(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await AggregateService.reconcile() });
        } catch (error) { next(error); }
    }

    static async rebuild(req, res, next) {
        try {
            const data = await AggregateService.rebuild(req.user, req.ip);
            res.status(200).json({ success: true, message: 'Đã dựng lại bảng tổng hợp', data });
        } catch (error) { next(error); }
    }
}

module.exports = AggregateController;
