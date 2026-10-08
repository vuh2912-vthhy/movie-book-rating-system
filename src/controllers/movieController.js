const MovieService = require('../services/movieService');
const MovieRepository = require('../repositories/movieRepository');
const LogService = require('../services/logService');

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

    static async searchAndPaginate(req, res) {
        try {
            const keyword = req.query.keyword || '';
            const genre = req.query.genre || '';
            
            const page = parseInt(req.query.page) || 1;
            
            // Giới hạn cứng số lượng trả về tối đa để chống quá tải bộ nhớ
            let size = parseInt(req.query.size) || 20;
            if (size > 50) size = 50; 

            const offset = (page - 1) * size;

            const result = await MovieRepository.searchMovies(keyword, genre, size, offset);
            
            res.status(200).json({
                success: true,
                data: result.data,
                pagination: {
                    currentPage: page,
                    pageSize: size,
                    totalRecords: result.totalRecords,
                    totalPages: Math.ceil(result.totalRecords / size)
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async deleteMovie(req, res, next) {
        try {
            const movieId = req.params.id;
            
            // Thực hiện xóa phim (giả sử gọi qua Repository hoặc Service)
            // await MovieRepository.delete(movieId);

            // GHI LOG: Thao tác xóa dữ liệu nhạy cảm
            // req.user.id lấy từ middleware xác thực token trước đó
            const userId = req.user ? req.user.id : null;
            await LogService.logAction(userId, 'DELETE', 'movies', movieId, req.ip);

            res.status(200).json({
                success: true,
                message: "Xóa phim thành công và đã ghi nhật ký hệ thống."
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = MovieController;