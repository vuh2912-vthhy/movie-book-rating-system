const bcrypt = require('bcrypt');
const AuthService = require('../services/authService');
const LogService = require('../services/auditLogService'); // Đảm bảo tên file import chuẩn xác

class AuthController {
    static async login(req, res, next) {
        try {
            const { email, password } = req.body;
            
            // LƯU Ý: Trong thực tế, AuthService sẽ lo việc gọi Repository để lấy user và so sánh mật khẩu.
            // Giả sử AuthService.loginUser trả về đối tượng { token, user }
            const { token, user } = await AuthService.loginUser(email, password);

            // GHI LOG: Đăng nhập thành công (Truyền req vào cuối, truyền user.id thật)
            await LogService.logAction(user.id, 'LOGIN_SUCCESS', 'users', user.id, req.ip);

            // Gắn token vào Cookie bảo mật đúng chuẩn BM7
            res.cookie('accessToken', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // true khi đưa lên Vercel
                sameSite: 'strict',
                maxAge: 3600000 
            });

            res.status(200).json({
                success: true,
                message: "Đăng nhập thành công",
                data: {
                    userId: user.id,
                    email: user.email
                }
            });
        } catch (error) {
            // GHI LOG: Đăng nhập thất bại
            await LogService.logAction(null, 'LOGIN_FAILED', 'users', null, req.ip);
            
            // Đẩy lỗi sang Middleware xử lý lỗi tập trung
            next(error);
        }
    }
}

module.exports = AuthController;