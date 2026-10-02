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

            // 1. Áp dụng Khóa hàng (Row Locking) để chống truy cập đồng thời
            const lockMovieQuery = `SELECT total_reviews, average_rating FROM Movies WHERE id = ? FOR UPDATE`;
            const [movieRows] = await connection.execute(lockMovieQuery, [movieId]);

            if (movieRows.length === 0) {
                throw new Error("Không tìm thấy phim để đánh giá");
            }

            const movie = movieRows[0];

            // 2. Tính toán điểm số mới trên Node.js (Bản lề cho thuật toán Bayesian)
            const newTotalReviews = movie.total_reviews + 1;
            const newAverageRating = ((movie.average_rating * movie.total_reviews) + rating) / newTotalReviews;

            // 3. Thêm bài đánh giá
            const insertReviewQuery = `INSERT INTO Reviews (user_id, movie_id, rating, content) VALUES (?, ?, ?, ?)`;
            await connection.execute(insertReviewQuery, [userId, movieId, rating, content]);

            // 4. Cập nhật điểm phim bằng các con số đã tính toán chính xác
            const updateMovieQuery = `
            UPDATE Movies 
            SET total_reviews = ?, average_rating = ?
            WHERE id = ?
        `;
            await connection.execute(updateMovieQuery, [newTotalReviews, newAverageRating, movieId]);

            await connection.commit();
            return { success: true, message: "Tạo đánh giá và cập nhật phim an toàn thành công!" };

        } catch (error) {
            await connection.rollback();
            throw new Error("Giao dịch thất bại, đã hoàn nguyên dữ liệu: " + error.message);
        } finally {
            if (connection) connection.release();
        }
    }
}

module.exports = ReviewService;