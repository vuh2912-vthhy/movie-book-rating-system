// src/repositories/reportRepository.js
const db = require('../config/database');

class ReportRepository {
    // Thống kê theo thể loại
    static async getStatsByGenre() {
        const query = `
            SELECT m.genre, COUNT(DISTINCT m.id) AS total_movies, 
                   COUNT(r.id) AS total_reviews, ROUND(AVG(r.rating), 2) AS average_genre_rating
            FROM Movies m LEFT JOIN Reviews r ON m.id = r.movie_id
            GROUP BY m.genre ORDER BY total_reviews DESC;
        `;
        const [rows] = await db.execute(query);
        return rows;
    }

    // Top phim thịnh hành
    static async getTopTrendingMovies() {
        const query = `
            SELECT m.id, m.title, m.genre, COUNT(r.id) AS review_count, ROUND(AVG(r.rating), 2) AS avg_rating
            FROM Movies m LEFT JOIN Reviews r ON m.id = r.movie_id
            GROUP BY m.id, m.title, m.genre ORDER BY avg_rating DESC, review_count DESC LIMIT 10;
        `;
        const [rows] = await db.execute(query);
        return rows;
    }

    // Xu hướng đánh giá 30 ngày qua
    static async getReviewTrends() {
        const query = `
            SELECT DATE(r.created_at) AS review_date, COUNT(r.id) AS daily_reviews_count, ROUND(AVG(r.rating), 2) AS daily_avg_rating
            FROM Reviews r WHERE r.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(r.created_at) ORDER BY review_date ASC;
        `;
        const [rows] = await db.execute(query);
        return rows;
    }
}

module.exports = ReportRepository;