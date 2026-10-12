'use strict';
const express = require('express');
const TitleController = require('../controllers/titleController');
const RatingController = require('../controllers/ratingController');
const ReviewController = require('../controllers/reviewController');
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

// Bình luận về tác phẩm. Danh sách công khai chỉ gồm bình luận đã duyệt.
router.get('/:id/reviews', optionalAuth, ReviewController.listPublic);
router.post('/:id/reviews', verifyToken, authorize('review.create'), ReviewController.create);
router.get('/:id/reviews/mine', verifyToken, ReviewController.getMine);
router.put('/:id/reviews/mine', verifyToken, authorize('review.update_own'), ReviewController.updateMine);
router.delete('/:id/reviews/mine', verifyToken, authorize('review.delete_own'), ReviewController.removeMine);

module.exports = router;
