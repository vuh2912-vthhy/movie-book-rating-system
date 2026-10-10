'use strict';
const express = require('express');
const TitleController = require('../controllers/titleController');
const RatingController = require('../controllers/ratingController');
const { verifyToken, optionalAuth, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

// Công khai (khách xem được; nhân viên đăng nhập xem thêm bản nháp / đã ẩn)
router.get('/', optionalAuth, TitleController.list);
router.get('/:id', optionalAuth, TitleController.getById);

// Quản trị nội dung: quyền kiểm tra ở MÁY CHỦ theo bảng role_permissions
router.post('/', verifyToken, authorize('title.create'), TitleController.create);
router.put('/:id', verifyToken, authorize('title.update'), TitleController.update);
router.delete('/:id', verifyToken, authorize('title.delete'), TitleController.remove);

// Điểm đánh giá của CHÍNH người đăng nhập (không có mã người dùng trên đường dẫn)
router.get('/:id/rating', verifyToken, RatingController.getMine);
router.put('/:id/rating', verifyToken, authorize('rating.create'), RatingController.upsert);
router.delete('/:id/rating', verifyToken, authorize('rating.delete_own'), RatingController.remove);

module.exports = router;
