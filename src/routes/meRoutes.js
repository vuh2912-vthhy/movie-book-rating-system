'use strict';
const express = require('express');
const MeController = require('../controllers/meController');
const { verifyToken, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

// Hồ sơ của chính mình: mọi người dùng đã đăng nhập
router.get('/profile', verifyToken, MeController.getProfile);
router.put('/profile', verifyToken, MeController.updateProfile);

// Bình luận của tôi (mọi trạng thái)
router.get('/reviews', verifyToken, MeController.listReviews);

// Danh sách theo dõi (quyền watchlist.manage)
router.get('/watchlist', verifyToken, authorize('watchlist.manage'), MeController.listWatchlist);
router.put('/watchlist/:titleId', verifyToken, authorize('watchlist.manage'), MeController.setWatchlist);
router.delete('/watchlist/:titleId', verifyToken, authorize('watchlist.manage'), MeController.removeWatchlist);

// Thông báo trong ứng dụng: mọi người dùng đã đăng nhập, chỉ thấy thông báo của chính mình
router.get('/notifications', verifyToken, MeController.listNotifications);
router.post('/notifications/read-all', verifyToken, MeController.markAllNotificationsRead);
router.post('/notifications/:id/read', verifyToken, MeController.markNotificationRead);

module.exports = router;
