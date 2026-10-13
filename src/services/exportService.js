'use strict';
const HttpError = require('../utils/httpError');
const { toCsv } = require('../utils/csv');
const { validateExport } = require('../utils/statsValidators');
const StatsService = require('./statsService');
const AuditLogService = require('./auditLogService');

const KIND_NAME = { movie: 'Phim', book: 'Sách' };
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

// Mỗi báo cáo được "làm phẳng" thành tiêu đề cột và các dòng, dùng chung cho CSV và Excel
const REPORT_BUILDERS = {
    async genres(v) {
        const { items } = await StatsService.genres({ kind: v.kind });
        return {
            sheet: 'Theo thể loại',
            headers: ['Mã thể loại', 'Tên thể loại', 'Số tác phẩm', 'Số lượt chấm', 'Điểm trung bình (theo lượt chấm)', 'Số bình luận đã duyệt', 'Tác phẩm đứng đầu'],
            rows: items.map((i) => [i.code, i.name, i.titleCount, i.ratingCount, i.ratingAvg, i.reviewCount, i.topTitle ? i.topTitle.title : null])
        };
    },
    async timeline(v) {
        const q = { granularity: v.timeline.granularity, months: String(v.timeline.months), days: String(v.timeline.days), kind: v.kind };
        const { items } = await StatsService.timeline(q);
        return {
            sheet: 'Theo thời gian',
            headers: ['Kỳ', 'Số lượt chấm', 'Điểm trung bình', 'Số bình luận', 'Số bình luận đã duyệt'],
            rows: items.map((i) => [i.period, i.ratings, i.avgScore, i.reviews, i.approvedReviews])
        };
    },
    async ranking(v) {
        const { items } = await StatsService.ranking({ source: v.ranking.source, kind: v.kind || v.ranking.kind, genre: v.ranking.genre, limit: String(v.ranking.limit) });
        return {
            sheet: 'Xếp hạng',
            headers: ['Hạng', 'Mã', 'Loại', 'Tiêu đề', 'Năm', 'Số lượt chấm', 'Điểm trung bình', 'Điểm xếp hạng (tin cậy)'],
            rows: items.map((i) => [i.rank, i.code, KIND_NAME[i.kind], i.title, i.releaseYear, i.ratingCount, i.ratingAvg, i.weightedScore])
        };
    },
    async catalog() {
        const items = await StatsService.catalog();
        return {
            sheet: 'Danh mục',
            headers: ['Mã', 'Loại', 'Tiêu đề', 'Năm', 'Thể loại', 'Số lượt chấm', 'Điểm trung bình', 'Điểm xếp hạng (tin cậy)', 'Số bình luận đã duyệt'],
            rows: items.map((i) => [i.code, KIND_NAME[i.kind], i.title, i.releaseYear, i.genres, i.ratingCount, i.ratingAvg, i.weightedScore, i.reviewCount])
        };
    },
    async overview() {
        const o = await StatsService.overview();
        return {
            sheet: 'Tổng quan',
            headers: ['Chỉ số', 'Giá trị'],
            rows: [
                ['Người dùng', o.users.total], ['Người dùng đang hoạt động', o.users.active],
                ['Tác phẩm', o.titles.total], ['Tác phẩm đã công bố', o.titles.published],
                ['Lượt chấm điểm', o.ratings.total], ['Lượt chấm 30 ngày gần nhất', o.ratings.last30Days],
                ['Bình luận', o.reviews.total], ['Bình luận chờ duyệt', o.reviews.pending], ['Bình luận đã duyệt', o.reviews.approved],
                ['Bình luận bị từ chối', o.reviews.rejected], ['Bình luận bị ẩn', o.reviews.hidden],
                ['Báo cáo vi phạm đang mở', o.reports.open], ['Báo cáo đã xử lý', o.reports.resolved], ['Báo cáo đã bác', o.reports.dismissed]
            ]
        };
    }
};

async function toXlsx(sheet, headers, rows) {
    let ExcelJS;
    try {
        ExcelJS = require('exceljs'); // nạp khi cần để không làm chậm khởi động các điểm cuối khác
    } catch (error) {
        throw new HttpError(501, 'XLSX_UNAVAILABLE', 'Máy chủ chưa cài thư viện exceljs (npm install exceljs)');
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Hệ thống Đánh giá và Phân tích Dữ liệu Phim/Sách';
    wb.created = new Date();
    const ws = wb.addWorksheet(sheet.slice(0, 31));
    ws.columns = headers.map((h, i) => {
        const longest = Math.max(String(h).length, ...rows.map((r) => String(r[i] === null || r[i] === undefined ? '' : r[i]).length));
        return { header: h, key: `c${i}`, width: Math.min(60, Math.max(12, longest + 2)) };
    });
    rows.forEach((r) => ws.addRow(Object.fromEntries(r.map((v, i) => [`c${i}`, v]))));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    // Chuỗi trong Excel được lưu là văn bản, không bao giờ được hiểu là công thức
    return Buffer.from(await wb.xlsx.writeBuffer());
}

class ExportService {
    static async build(query, user, ip) {
        const { errors, value } = validateExport(query);
        if (errors.length) throw HttpError.unprocessable('Tham số xuất báo cáo không hợp lệ', errors);

        const { sheet, headers, rows } = await REPORT_BUILDERS[value.report](value);
        const filename = `bao-cao-${value.report}-${today()}.${value.format}`;
        let body;
        let contentType;
        if (value.format === 'xlsx') {
            body = await toXlsx(sheet, headers, rows);
            contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else {
            body = Buffer.from(toCsv(headers, rows, { delimiter: value.delimiter }), 'utf8');
            contentType = 'text/csv; charset=utf-8';
        }
        await AuditLogService.logAction(user.id, 'STATS_EXPORT', 'stats', null, ip);
        return { body, contentType, filename, rowCount: rows.length };
    }
}

module.exports = ExportService;
