'use strict';
const express = require('express');
const { verifyToken, authorize } = require('../middlewares/authMiddleware');
const LogController = require('../controllers/logController');
const AggregateController = require('../controllers/aggregateController');

const router = express.Router();

// Nhật ký hệ thống (chỉ ADMIN: quyền audit.read)
router.get('/system-logs', verifyToken, authorize('audit.read'), LogController.getLogs);

// Đối soát và dựng lại bảng tổng hợp xếp hạng (chỉ ADMIN: quyền aggregate.rebuild)
router.get('/aggregates/reconcile', verifyToken, authorize('aggregate.rebuild'), AggregateController.reconcile);
router.post('/aggregates/rebuild', verifyToken, authorize('aggregate.rebuild'), AggregateController.rebuild);

module.exports = router;
