// src/controllers/reviewController.js
const ReviewService = require('../services/reviewService');

class ReviewController {
    static async update(req, res, next) {
        try {
            const reviewId = req.params.id;
            
            // Giả lập Tài khoản B (User ID = 2) đang đăng nhập và cố tình gọi API
            const currentUserId = 2; 

            // Chuyển xuống tầng Service xử lý
            const updatedReview = await ReviewService.updateReview(reviewId, currentUserId, req.body.content);
            
            res.status(200).json({
                success: true,
                message: "Sửa thành công",
                data: updatedReview
            });
        } catch (error) {
            next(error); // Ném lỗi 403 sang errorHandler
        }
    }
}

module.exports = ReviewController;