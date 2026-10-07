const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const AuthController = require('./src/controllers/authController');
const ReviewController = require('./src/controllers/reviewController');
const reviewRoutes = require('./src/routes/reviewRoutes'); 
const movieRoutes = require('./src/routes/movieRoutes');   
const app = express();
const { upload, verifyMagicBytes } = require('./src/middlewares/uploadMiddleware');

// --- THÊM ĐOẠN CODE NÀY ĐỂ BẮT MỌI REQUEST ---
app.use((req, res, next) => {
    console.log(`🔍 [INCOMING REQUEST] Phương thức: ${req.method} | Đường dẫn gốc: ${req.url}`);
    next();
});
// ---------------------------------------------
// Kích hoạt middleware để đọc dữ liệu JSON và Cookie
app.use(express.json());
app.use(cookieParser());

// Kích hoạt routes với tiền tố /api
app.use('/api/reviews', reviewRoutes);
// Thêm đoạn code này để kiểm tra xem request có chạm tới server không
app.use('/api/movies', (req, res, next) => {
    console.log(`[DEBUG ROUTE] Nhận request: ${req.method} ${req.originalUrl}`);
    next();
});

app.use('/api/v1/movies', movieRoutes);
app.post('/api/v1/movies/upload-poster', upload.single('poster'), verifyMagicBytes, (req, res) => {
    try {
        res.status(200).json({
            success: true,
            message: "Tải tệp an toàn thành công!",
            filePath: `/storage/uploads/${req.verifiedFile.filename}`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// Định tuyến API đăng nhập
app.post('/api/login', AuthController.login);

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

console.log('SERVER VERSION: upload-poster v2');

module.exports = app;
