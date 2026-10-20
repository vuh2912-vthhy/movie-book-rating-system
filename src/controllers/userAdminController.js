'use strict';
const UserAdminService = require('../services/userAdminService');

class UserAdminController {
    static async list(req, res, next) {
        try {
            const { items, pagination } = await UserAdminService.list(req.query);
            res.status(200).json({ success: true, data: items, pagination });
        } catch (error) { next(error); }
    }

    static async lock(req, res, next) {
        try { res.status(200).json({ success: true, message: 'Đã khóa tài khoản', data: await UserAdminService.lock(req.user, req.params.id, req.ip) }); }
        catch (error) { next(error); }
    }

    static async unlock(req, res, next) {
        try { res.status(200).json({ success: true, message: 'Đã mở khóa tài khoản', data: await UserAdminService.unlock(req.user, req.params.id, req.ip) }); }
        catch (error) { next(error); }
    }

    static async setRole(req, res, next) {
        try { res.status(200).json({ success: true, message: 'Đã đổi vai trò', data: await UserAdminService.setRole(req.user, req.params.id, req.body, req.ip) }); }
        catch (error) { next(error); }
    }
}

module.exports = UserAdminController;
