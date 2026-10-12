'use strict';
const express = require('express');
const ModerationController = require('../controllers/moderationController');
const { verifyToken, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

// Hàng đợi bình luận và duyệt bình luận (quyền review.moderate: MODERATOR, ADMIN)
router.get('/reviews', verifyToken, authorize('review.moderate'), ModerationController.listReviews);
router.post('/reviews/:id/moderate', verifyToken, authorize('review.moderate'), ModerationController.moderate);

// Hàng đợi báo cáo và xử lý báo cáo (quyền report.handle: MODERATOR, ADMIN)
router.get('/reports', verifyToken, authorize('report.handle'), ModerationController.listReports);
router.post('/reports/:id/handle', verifyToken, authorize('report.handle'), ModerationController.handleReport);

module.exports = router;
