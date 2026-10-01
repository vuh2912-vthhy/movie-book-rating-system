const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const AuthController = require('./src/controllers/authController');
const ReviewController = require('./src/controllers/reviewController');
const app = express();

// Kích hoạt middleware để đọc dữ liệu JSON và Cookie
app.use(express.json());
app.use(cookieParser());

// Trang chào (phục vụ index.html ở đường dẫn gốc)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Điểm cuối kiểm tra sức khỏe, dùng để kiểm chứng sau mỗi lần phát hành
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'movie-book-rating-system', time: new Date().toISOString() });
});

// Định tuyến API đăng nhập
app.post('/api/login', AuthController.login);
app.put('/api/reviews/:id', ReviewController.update);
app.post('/api/reviews', ReviewController.create);

// Tầng xử lý lỗi tập trung của V1
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
});

const PORT = process.env.PORT || 3000;

// Vercel nạp ứng dụng qua module.exports; chỉ tự lắng nghe cổng khi chạy cục bộ
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
    });
}

module.exports = app;
