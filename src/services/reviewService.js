// src/services/reviewService.js

const db = require('../config/database'); 

class ReviewService {

    static async updateReview(reviewId, currentUserId, newContent) {
        const mockReviewFromDB = { 
            id: reviewId, 
            userId: 1, 
            content: "Phim này rất hay!" 
        };

        if (mockReviewFromDB.userId !== currentUserId) {
            const error = new Error('Lỗi truy cập chéo: Bạn không có quyền sửa bài đánh giá của người khác!');
            error.statusCode = 403; 
            throw error;
        }

        return { ...mockReviewFromDB, content: newContent };
    }

    static async createReviewWithTransaction(userId, movieId, rating, content) {
        const connection = await db.getConnection(); 
        
        try {
            await connection.beginTransaction();

            // 1. Thêm bài đánh giá
            const insertReviewQuery = `INSERT INTO Reviews (user_id, movie_id, rating, content) VALUES (?, ?, ?, ?)`;
            await connection.execute(insertReviewQuery, [userId, movieId, rating, content]);

            // 2. Cập nhật điểm phim
            const updateMovieQuery = `
                UPDATE Movies 
                SET total_reviews = total_reviews + 1,
                    average_rating = (average_rating * (total_reviews - 1) + ?) / total_reviews
                WHERE id = ?
            `;
            await connection.execute(updateMovieQuery, [rating, movieId]);

            await connection.commit();
            return { success: true, message: "Tạo đánh giá và cập nhật phim thành công!" };

        } catch (error) {
            await connection.rollback();
            throw new Error("Giao dịch thất bại, đã hoàn nguyên dữ liệu: " + error.message);
        } finally {
            if (connection) connection.release();
        }
    }
}

module.exports = ReviewService;