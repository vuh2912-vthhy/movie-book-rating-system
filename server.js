'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const env = require('./src/config/env'); // kiểm tra biến môi trường ngay khi khởi động
const db = require('./src/config/database');
const { notFoundHandler, errorHandler } = require('./src/middlewares/errorHandler');

const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const titleRoutes = require('./src/routes/titleRoutes');
const genreRoutes = require('./src/routes/genreRoutes');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // phía sau proxy của Vercel: req.ip là IP thật của người dùng

app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Kiểm tra sống: dùng cho giám sát và để "làm nóng" hàm serverless trước giờ chấm
app.get('/api/v1/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.status(200).json({ success: true, data: { status: 'ok' } });
    } catch (error) {
        console.error('[health] Lỗi kết nối CSDL:', error.code || error.message);
        res.status(503).json({
            success: false,
            error: { code: 'DB_UNAVAILABLE', message: 'Không kết nối được cơ sở dữ liệu', details: [] }
        });
    }
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/titles', titleRoutes);
app.use('/api/v1/genres', genreRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

// Vercel nạp ứng dụng qua module.exports; chỉ tự lắng nghe cổng khi chạy cục bộ
if (require.main === module) {
    app.listen(env.port, () => console.log(`Server đang chạy tại http://localhost:${env.port}`));
}

module.exports = app;
