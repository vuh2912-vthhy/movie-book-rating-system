'use strict';
const GenreService = require('../services/genreService');

class GenreController {
    static async list(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await GenreService.list() });
        } catch (error) { next(error); }
    }

    static async create(req, res, next) {
        try {
            const data = await GenreService.create(req.user, req.body, req.ip);
            res.status(201).location(`/api/v1/genres/${data.id}`).json({ success: true, message: 'Đã tạo thể loại', data });
        } catch (error) { next(error); }
    }

    static async update(req, res, next) {
        try { res.status(200).json({ success: true, message: 'Đã cập nhật thể loại', data: await GenreService.update(req.user, req.params.id, req.body, req.ip) }); }
        catch (error) { next(error); }
    }

    static async remove(req, res, next) {
        try { await GenreService.remove(req.user, req.params.id, req.ip); res.status(200).json({ success: true, message: 'Đã xóa thể loại' }); }
        catch (error) { next(error); }
    }
}

module.exports = GenreController;
