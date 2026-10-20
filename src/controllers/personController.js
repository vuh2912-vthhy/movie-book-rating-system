'use strict';
const PersonService = require('../services/personService');

class PersonController {
    static async list(req, res, next) {
        try {
            const { items, pagination } = await PersonService.list(req.query);
            res.status(200).json({ success: true, data: items, pagination });
        } catch (error) { next(error); }
    }

    static async getById(req, res, next) {
        try { res.status(200).json({ success: true, data: await PersonService.getById(req.params.id) }); }
        catch (error) { next(error); }
    }

    static async create(req, res, next) {
        try {
            const data = await PersonService.create(req.user, req.body, req.ip);
            res.status(201).location(`/api/v1/persons/${data.id}`).json({ success: true, message: 'Đã tạo nhân vật', data });
        } catch (error) { next(error); }
    }

    static async update(req, res, next) {
        try { res.status(200).json({ success: true, message: 'Đã cập nhật nhân vật', data: await PersonService.update(req.user, req.params.id, req.body, req.ip) }); }
        catch (error) { next(error); }
    }
}

module.exports = PersonController;
