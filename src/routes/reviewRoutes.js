'use strict';
const express = require('express');
const ReviewController = require('../controllers/reviewController');
const { verifyToken, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

// Bình chọn hữu ích và báo cáo vi phạm một bình luận đang công khai
router.put('/:id/vote', verifyToken, authorize('vote.create'), ReviewController.setVote);
router.delete('/:id/vote', verifyToken, authorize('vote.create'), ReviewController.removeVote);
router.post('/:id/reports', verifyToken, authorize('report.create'), ReviewController.report);

module.exports = router;
