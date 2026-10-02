const express = require('express');
const router = express.Router();
const MovieController = require('../controllers/movieController');

// Khai báo đường dẫn lấy danh sách phim thịnh hành.
// Nguyên tắc: Route định danh cụ thể (/trending) bắt buộc phải đặt TRƯỚC các route chứa tham số (như /:id) để tránh xung đột.
router.get('/trending', MovieController.getTrending);

module.exports = router;