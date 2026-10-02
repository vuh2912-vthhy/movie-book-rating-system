const db = require('../config/database');

class MovieService {
    static async getTrendingMovies() {
        const [movies] = await db.execute(`SELECT * FROM Movies WHERE total_reviews > 0`);
        
        if (movies.length === 0) return [];

        // 1. Tính toán hằng số hệ thống
        const m = 5; // Yêu cầu tối thiểu 5 lượt đánh giá để chứng tỏ độ tin cậy
        
        let totalSystemReviews = 0;
        let totalSystemScore = 0;
        movies.forEach(movie => {
            totalSystemReviews += movie.total_reviews;
            totalSystemScore += (movie.average_rating * movie.total_reviews);
        });
        
        // C: Điểm trung bình toàn hệ thống
        const C = totalSystemReviews === 0 ? 0 : totalSystemScore / totalSystemReviews;

        // 2. Áp dụng thuật toán Bayesian cho từng bộ phim
        const trendingMovies = movies.map(movie => {
            const v = movie.total_reviews;
            const R = movie.average_rating;
            
            // Tính trọng số W
            const W = ((v / (v + m)) * R) + ((m / (v + m)) * C);
            
            return {
                ...movie,
                trending_score: parseFloat(W.toFixed(2)) // Làm tròn 2 chữ số
            };
        });

        // 3. Sắp xếp giảm dần theo điểm thịnh hành (W) và lấy Top 10
        trendingMovies.sort((a, b) => b.trending_score - a.trending_score);
        return trendingMovies.slice(0, 10);
    }
}

module.exports = MovieService;