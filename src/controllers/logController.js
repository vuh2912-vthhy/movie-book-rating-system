'use strict';
const AuditLogService = require('../services/auditLogService');

class LogController {
    static async getLogs(req, res, next) {
        try {
            const { items, pagination } = await AuditLogService.list(req.query);
            res.status(200).json({ success: true, data: items, pagination });
        } catch (error) { next(error); }
    }
}

module.exports = LogController;
