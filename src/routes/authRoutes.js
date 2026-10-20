'use strict';
const express = require('express');
const AuthController = require('../controllers/authController');
const { verifyToken } = require('../middlewares/authMiddleware');

const router = express.Router();

// POST /api/v1/auth/register  - đăng ký (vai trò USER)
router.post('/register', AuthController.register);
// POST /api/v1/auth/login     - đăng nhập, phát cookie accessToken
router.post('/login', AuthController.login);
// POST /api/v1/auth/logout    - đăng xuất, thu hồi token
router.post('/logout', verifyToken, AuthController.logout);
// GET  /api/v1/auth/me        - thông tin, vai trò, quyền của người đang đăng nhập
router.get('/me', verifyToken, AuthController.me);

// POST /api/v1/auth/change-password  - đổi mật khẩu (cần mật khẩu hiện tại), thu hồi mọi thẻ
router.post('/change-password', verifyToken, AuthController.changePassword);
// POST /api/v1/auth/forgot-password  - xin mã đặt lại (mô phỏng gửi thư), luôn trả cùng thông điệp
router.post('/forgot-password', AuthController.forgotPassword);
// POST /api/v1/auth/reset-password   - đặt lại mật khẩu bằng mã dùng một lần
router.post('/reset-password', AuthController.resetPassword);

module.exports = router;
