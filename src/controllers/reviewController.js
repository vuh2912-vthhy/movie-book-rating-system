// src/controllers/reviewController.js
const ReviewService = require('../services/reviewService');

class ReviewController {

    static async update(req, res, next) {
        try {
            const reviewId = req.params.id;
            const currentUserId = 2; // Giả lập Tài khoản B
            
            const updatedReview = await ReviewService.updateReview(reviewId, currentUserId, req.body.content);
            
            res.status(200).json({
                success: true,
                message: "Sửa thành công",
                data: updatedReview
            });
        } catch (error) {
            next(error); 
        }
    }

    static async create(req, res, next) {
        try {
            const { movieId, rating, content } = req.body;
            const userId = 1; // Giả lập ID người dùng đang đăng nhập

            // 1. Bắt lỗi: Gửi thiếu trường bắt buộc
            if (!movieId || !rating || !content) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Lỗi ngoại lệ: Thiếu trường dữ liệu bắt buộc (movieId, rating, content)!" 
                });
            }

            // 2. Bắt lỗi: Giá trị vượt giới hạn (Điểm đánh giá chỉ từ 1 đến 5)
            if (rating < 1 || rating > 5) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Lỗi ngoại lệ: Điểm đánh giá vượt giới hạn (chỉ được phép từ 1 đến 5)!" 
                });
            }

            // Nếu dữ liệu chuẩn -> Gọi Service xử lý Giao dịch (Transaction)
            const result = await ReviewService.createReviewWithTransaction(userId, movieId, rating, content);
            
            res.status(201).json(result);
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = ReviewController;