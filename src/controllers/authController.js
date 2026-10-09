'use strict';
// Tầng điều khiển: chỉ đọc yêu cầu HTTP, gọi service, định dạng phản hồi. Không có nghiệp vụ.
const env = require('../config/env');
const AuthService = require('../services/authService');
const { ACCESS_TOKEN_COOKIE } = require('../middlewares/authMiddleware');

// httpOnly: JavaScript không đọc được cookie (giảm rủi ro XSS đánh cắp token)
// sameSite=strict: trình duyệt không gửi cookie trong yêu cầu từ trang web khác (giảm CSRF)
// secure: chỉ gửi qua HTTPS khi chạy production (Vercel)
const baseCookieOptions = () => ({
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'strict',
    path: '/'
});

class AuthController {
    static async register(req, res, next) {
        try {
            const user = await AuthService.register(req.body, req.ip);
            res.status(201).json({ success: true, message: 'Đăng ký thành công', data: user });
        } catch (error) {
            next(error);
        }
    }

    static async login(req, res, next) {
        try {
            const { token, user } = await AuthService.login(req.body, req.ip);
            res.cookie(ACCESS_TOKEN_COOKIE, token, { ...baseCookieOptions(), maxAge: env.jwt.expiresInMs });
            res.status(200).json({ success: true, message: 'Đăng nhập thành công', data: { user } });
        } catch (error) {
            next(error);
        }
    }

    static async logout(req, res, next) {
        try {
            await AuthService.logout(req.user.id, req.ip);
            res.clearCookie(ACCESS_TOKEN_COOKIE, baseCookieOptions());
            res.status(200).json({ success: true, message: 'Đã đăng xuất' });
        } catch (error) {
            next(error);
        }
    }

    static me(req, res) {
        const { id, email, fullName, displayName, roles, permissions } = req.user;
        res.status(200).json({ success: true, data: { id, email, fullName, displayName, roles, permissions } });
    }
}

module.exports = AuthController;
