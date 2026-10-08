const express = require('express');
const router = express.Router();
const { verifyToken, isAdmin } = require('../middlewares/authMiddleware'); 

// Nhập khẩu LogController đã chuẩn hóa kiến trúc
const LogController = require('../controllers/logController');

// Endpoint: GET /api/v1/admin/system-logs
// Giao toàn bộ luồng xử lý truy vấn cho Controller, Route chỉ làm nhiệm vụ điều hướng và chắn cổng bảo mật
router.get('/system-logs', verifyToken, isAdmin, LogController.getLogs);

module.exports = router;
