// src/repositories/movieRepository.js
const db = require('../config/database'); // Đảm bảo đường dẫn tới file kết nối CSDL của bạn là đúng

class MovieRepository {
    /**
     * Tìm kiếm, lọc và phân trang danh sách phim
     * @param {string} keyword - Từ khóa tìm kiếm theo tên phim
     * @param {string} genre - Thể loại phim cần lọc
     * @param {number} limit - Số bản ghi tối đa trên một trang
     * @param {number} offset - Vị trí bắt đầu lấy dữ liệu
     */
    static async searchMovies(keyword, genre, limit, offset) {
        // Khởi tạo câu lệnh cơ bản (1=1 là thủ thuật để dễ dàng nối thêm AND phía sau)
        let sql = `SELECT * FROM Movies WHERE 1=1`;
        let countSql = `SELECT COUNT(*) as total FROM Movies WHERE 1=1`;
        const params = [];

        // Nếu người dùng có nhập từ khóa tìm kiếm
        if (keyword) {
            sql += ` AND title LIKE ?`;
            countSql += ` AND title LIKE ?`;
            params.push(`%${keyword}%`); // Sử dụng % để tìm kiếm chuỗi con chứa từ khóa
        }

        // Nếu người dùng có chọn thể loại để lọc
        if (genre) {
            sql += ` AND genre = ?`;
            countSql += ` AND genre = ?`;
            params.push(genre);
        }

        // BẮT BUỘC: Sắp xếp theo created_at và thêm id để chống lặp dữ liệu (Lỗi số 3)
        sql += ` ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
        
        // Gộp mảng tham số: tham số điều kiện + limit + offset
        const dataParams = [...params, limit, offset];

        try {
            // Chạy đồng thời 2 truy vấn: Lấy dữ liệu trang hiện tại và Đếm tổng số bản ghi
            const [rows] = await db.execute(sql, dataParams);
            const [countResult] = await db.execute(countSql, params);

            return {
                data: rows,
                totalRecords: countResult[0].total
            };
        } catch (error) {
            throw error; // Ném lỗi lên tầng Controller để xử lý tập trung
        }
    }
}

// Xuất module để tầng Controller có thể gọi được
module.exports = MovieRepository;