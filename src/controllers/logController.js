'use strict';
const AuditLogService = require('../services/auditLogService');

class LogController {
    static async getLogs(req, res, next) {
        try {
            const { items, pagination } = await AuditLogService.list(req.query);
            res.status(200).json({ success: true, data: items, pagination });
        } catch (error) { next(error); }
    }

    static async getActions(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await AuditLogService.listActions() });
        } catch (error) { next(error); }
    }
}

module.exports = LogController;
