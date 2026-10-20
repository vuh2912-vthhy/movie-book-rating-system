'use strict';
const express = require('express');
const { verifyToken, authorize } = require('../middlewares/authMiddleware');
const LogController = require('../controllers/logController');
const AggregateController = require('../controllers/aggregateController');

const UserAdminController = require('../controllers/userAdminController');

const router = express.Router();

// Nhật ký hệ thống (chỉ ADMIN: quyền audit.read). Lọc theo userId, action, entity, ip, from, to.
router.get('/system-logs', verifyToken, authorize('audit.read'), LogController.getLogs);
router.get('/system-logs/actions', verifyToken, authorize('audit.read'), LogController.getActions);

// Đối soát và dựng lại bảng tổng hợp xếp hạng (chỉ ADMIN: quyền aggregate.rebuild)
router.get('/aggregates/reconcile', verifyToken, authorize('aggregate.rebuild'), AggregateController.reconcile);
router.post('/aggregates/rebuild', verifyToken, authorize('aggregate.rebuild'), AggregateController.rebuild);

// Quản trị người dùng: user.manage (tra cứu, khóa, mở khóa), role.manage (đổi vai trò)
router.get('/users', verifyToken, authorize('user.manage'), UserAdminController.list);
router.post('/users/:id/lock', verifyToken, authorize('user.manage'), UserAdminController.lock);
router.post('/users/:id/unlock', verifyToken, authorize('user.manage'), UserAdminController.unlock);
router.put('/users/:id/role', verifyToken, authorize('role.manage'), UserAdminController.setRole);

module.exports = router;
