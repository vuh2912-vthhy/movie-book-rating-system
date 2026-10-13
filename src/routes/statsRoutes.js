'use strict';
const express = require('express');
const StatsController = require('../controllers/statsController');
const { verifyToken, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

// Bảng xếp hạng công khai (YCCN-32). source=aggregate đọc cột tổng hợp, source=live tính khi đọc (để so sánh hiệu năng)
router.get('/ranking', StatsController.ranking);

// Báo cáo thống kê chuyên sâu (quyền stats.analytics: MODERATOR, ADMIN)
router.get('/genres', verifyToken, authorize('stats.analytics'), StatsController.genres);
router.get('/timeline', verifyToken, authorize('stats.analytics'), StatsController.timeline);
router.get('/overview', verifyToken, authorize('stats.analytics'), StatsController.overview);

// Xuất CSV hoặc Excel (quyền stats.export: chỉ ADMIN)
router.get('/export', verifyToken, authorize('stats.export'), StatsController.export);

module.exports = router;
