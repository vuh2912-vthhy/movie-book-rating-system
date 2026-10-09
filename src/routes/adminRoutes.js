'use strict';
const express = require('express');
const { verifyToken, authorize } = require('../middlewares/authMiddleware');
const LogController = require('../controllers/logController');

const router = express.Router();

// GET /api/v1/admin/system-logs - cần đăng nhập VÀ có quyền audit.read (chỉ ADMIN)
router.get('/system-logs', verifyToken, authorize('audit.read'), LogController.getLogs);

module.exports = router;
