'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const env = require('./src/config/env'); // kiểm tra biến môi trường ngay khi khởi động
const db = require('./src/config/database');
const { notFoundHandler, errorHandler } = require('./src/middlewares/errorHandler');

const requestId = require('./src/middlewares/requestId');
const { securityHeaders, csrfProtection, authLimiter, apiLimiter } = require('./src/middlewares/securityMiddleware');

const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const titleRoutes = require('./src/routes/titleRoutes');
const genreRoutes = require('./src/routes/genreRoutes');
const reviewRoutes = require('./src/routes/reviewRoutes');
const moderationRoutes = require('./src/routes/moderationRoutes');
const meRoutes = require('./src/routes/meRoutes');
const statsRoutes = require('./src/routes/statsRoutes');
const fileRoutes = require('./src/routes/fileRoutes');
const personRoutes = require('./src/routes/personRoutes');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // phía sau proxy của Vercel: req.ip là IP thật của người dùng

app.use(requestId);                          // mã định danh yêu cầu cho nhật ký lỗi
app.use(securityHeaders);                    // BM12 + BM2: thẻ tiêu đề bảo mật, CSP
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api/v1', csrfProtection);          // BM3: chống giả mạo yêu cầu chéo trang
app.use('/api/v1', apiLimiter);              // BM10: giới hạn tần suất chung

// Tài liệu API tương tác (Swagger UI) và tệp đặc tả OpenAPI
app.get('/api-docs', (req, res) => res.sendFile(path.join(__dirname, 'api-docs.html')));
app.get('/openapi.yaml', (req, res) => {
    res.type('text/yaml; charset=utf-8').sendFile(path.join(__dirname, 'openapi.yaml'));
});

// Hỗ trợ công cụ tìm kiếm: robots.txt và sitemap.xml (chỉ các trang công khai; giao diện dùng đường dẫn băm nên chỉ liệt kê trang gốc và tài liệu API)
const origin = (req) => `${req.protocol}://${req.get('host')}`;
app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${origin(req)}/sitemap.xml\n`);
});
app.get('/sitemap.xml', (req, res) => {
    const day = new Date().toISOString().slice(0, 10);
    const urls = ['/', '/api-docs'].map((u) => `  <url><loc>${origin(req)}${u}</loc><lastmod>${day}</lastmod></url>`).join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});

app.use('/public', express.static(path.join(__dirname, 'public'), { maxAge: '1d', index: false }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Kiểm tra sống: dùng cho giám sát và để "làm nóng" hàm serverless trước giờ chấm
app.get(['/api/v1/health', '/healthz'], async (req, res) => {   // /healthz: tên chuẩn của tài liệu môn học
    try {
        await db.query('SELECT 1');
        res.status(200).json({ success: true, trangThai: 'ok', data: { status: 'ok' } });
    } catch (error) {
        console.error('[health] Lỗi kết nối CSDL:', error.code || error.message);
        res.status(503).json({
            success: false,
            error: { code: 'DB_UNAVAILABLE', message: 'Không kết nối được cơ sở dữ liệu', details: [] }
        });
    }
});

app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/titles', titleRoutes);
app.use('/api/v1/genres', genreRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/moderation', moderationRoutes);
app.use('/api/v1/me', meRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/persons', personRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// Vercel nạp ứng dụng qua module.exports; chỉ tự lắng nghe cổng khi chạy cục bộ
if (require.main === module) {
    app.listen(env.port, () => console.log(`Server đang chạy tại http://localhost:${env.port}`));
}

module.exports = app;
