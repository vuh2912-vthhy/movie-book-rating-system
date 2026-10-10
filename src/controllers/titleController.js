'use strict';
// Tầng điều khiển: đọc yêu cầu HTTP, gọi service, định dạng phản hồi. Không có nghiệp vụ, không có SQL.
const TitleService = require('../services/titleService');

class TitleController {
    static async list(req, res, next) {
        try {
            const { items, pagination } = await TitleService.list(req.query, req.user);
            res.status(200).json({ success: true, data: items, pagination });
        } catch (error) { next(error); }
    }

    static async getById(req, res, next) {
        try {
            const data = await TitleService.getById(req.params.id, req.user);
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    }

    static async create(req, res, next) {
        try {
            const data = await TitleService.create(req.body, req.user, req.ip);
            res.status(201).json({ success: true, message: 'Đã tạo tác phẩm', data });
        } catch (error) { next(error); }
    }

    static async update(req, res, next) {
        try {
            const data = await TitleService.update(req.params.id, req.body, req.user, req.ip);
            res.status(200).json({ success: true, message: 'Đã cập nhật tác phẩm', data });
        } catch (error) { next(error); }
    }

    static async remove(req, res, next) {
        try {
            await TitleService.remove(req.params.id, req.user, req.ip);
            res.status(200).json({ success: true, message: 'Đã ẩn tác phẩm' });
        } catch (error) { next(error); }
    }
}

module.exports = TitleController;
