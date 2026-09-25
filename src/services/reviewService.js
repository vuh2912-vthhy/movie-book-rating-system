// src/services/reviewService.js
class ReviewService {
    static async updateReview(reviewId, currentUserId, newContent) {
        // Giả lập dữ liệu từ Database: Bài đánh giá này do User có ID là 1 tạo ra.
        const mockReviewFromDB = { 
            id: reviewId, 
            userId: 1, // Chủ sở hữu thực sự là User 1
            content: "Phim này rất hay!" 
        };

        // KIỂM TRA QUYỀN TRÊN ĐỐI TƯỢNG (Chống truy cập chéo)
        // Nếu ID của người đang request không khớp với ID chủ bài viết -> Chặn!
        if (mockReviewFromDB.userId !== currentUserId) {
            const error = new Error('Lỗi truy cập chéo: Bạn không có quyền sửa bài đánh giá của người khác!');
            error.statusCode = 403; // 403 Forbidden
            throw error;
        }

        // Nếu hợp lệ thì cho phép cập nhật (giả lập)
        return { ...mockReviewFromDB, content: newContent };
    }
}

module.exports = ReviewService;