const express = require('express');
const cookieParser = require('cookie-parser');
const AuthController = require('./src/controllers/authController');
const ReviewController = require('./src/controllers/reviewController');
const app = express();

// Kích hoạt middleware để đọc dữ liệu JSON và Cookie
app.use(express.json());
app.use(cookieParser());

// Định tuyến API đăng nhập
app.post('/api/login', AuthController.login);
app.put('/api/reviews/:id', ReviewController.update);

// Tầng xử lý lỗi tập trung của V1
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ success: false, message: err.message });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});