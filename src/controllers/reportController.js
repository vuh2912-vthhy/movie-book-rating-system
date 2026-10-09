const db = require('../config/database');
const { Parser } = require('json2csv');

class ReportController {
    // API lấy dữ liệu JSON cho biểu đồ (Dùng chung cho Frontend vẽ biểu đồ)
    static async getGenreStats(req, res, next) {
        try {
            const sql = `
                SELECT g.name AS genre_name, COUNT(mg.movie_id) AS total_movies
                FROM genres g
                LEFT JOIN movie_genres mg ON g.id = mg.genre_id
                GROUP BY g.id, g.name
                ORDER BY total_movies DESC;
            `;
            const [data] = await db.query(sql);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    }

    // API tải thẳng file CSV (Frontend gọi qua thẻ <a> hoặc window.open)
    static async exportGenreStatsCSV(req, res, next) {
        try {
            const sql = `
                SELECT g.name AS 'Thể loại', COUNT(mg.movie_id) AS 'Số lượng phim'
                FROM genres g
                LEFT JOIN movie_genres mg ON g.id = mg.genre_id
                GROUP BY g.id, g.name
                ORDER BY 'Số lượng phim' DESC;
            `;
            const [data] = await db.query(sql);

            if (data.length === 0) {
                return res.status(404).json({ message: "Không có dữ liệu" });
            }

            // Cấu hình Parser chuyển đổi JSON sang định dạng CSV
            const json2csvParser = new Parser({ withBOM: true }); // withBOM giúp Excel đọc được tiếng Việt có dấu
            const csv = json2csvParser.parse(data);

            // Đặt header ép trình duyệt tải file
            res.header('Content-Type', 'text/csv; charset=utf-8');
            res.attachment('ThongKeTheLoai.csv');
            return res.send(csv);
        } catch (error) {
            next(error);
        }
    }
}
module.exports = ReportController;