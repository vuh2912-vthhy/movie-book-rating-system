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

module.exports = router;
