// src/controllers/logController.js
const AuditLogRepository = require('../repositories/auditLogRepository');

// Cấu hình phân trang mặc định và giới hạn cứng chống quá tải bộ nhớ
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Chuẩn hóa tham số phân trang từ query string về khoảng hợp lệ
const normalizePagination = (query) => {
    const parsedPage = parseInt(query.page, 10);
    const parsedSize = parseInt(query.size, 10);

    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_PAGE;

    let size = Number.isInteger(parsedSize) && parsedSize > 0 ? parsedSize : DEFAULT_PAGE_SIZE;
    if (size > MAX_PAGE_SIZE) size = MAX_PAGE_SIZE;

    return { page, size };
};

class LogController {
    static async getLogs(req, res, next) {
        try {
            const { page, size } = normalizePagination(req.query);
            const offset = (page - 1) * size;

            // Truy vấn dữ liệu và tổng số bản ghi song song để giảm độ trễ
            const [logs, totalRecords] = await Promise.all([
                AuditLogRepository.findPaginated(size, offset),
                AuditLogRepository.countAll()
            ]);

            res.status(200).json({
                success: true,
                data: logs,
                pagination: {
                    currentPage: page,
                    pageSize: size,
                    totalRecords: totalRecords,
                    totalPages: Math.ceil(totalRecords / size)
                }
            });
        } catch (error) {
            // Đẩy lỗi sang Middleware xử lý lỗi tập trung
            next(error);
        }
    }
}

module.exports = LogController;
