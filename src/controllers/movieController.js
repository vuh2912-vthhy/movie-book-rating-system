const MovieService = require('../services/movieService');

class MovieController {
    static async getTrending(req, res) {
        try {
            const trendingMovies = await MovieService.getTrendingMovies();
            res.status(200).json({
                success: true,
                message: "Lấy danh sách phim thịnh hành thành công",
                data: trendingMovies
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

module.exports = MovieController;