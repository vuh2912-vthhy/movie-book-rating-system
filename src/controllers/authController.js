const bcrypt = require('bcrypt');

const AuthService = require('../services/authService');

class AuthController {
    static async login(req, res, next) {
        try {
            const { email, password } = req.body;
            
            // Giả lập lấy mật khẩu đã băm từ DB (Thực tế sẽ lấy qua UserRepository)
            const mockStoredPassword = await bcrypt.hash("123456", 10); 

            // Gọi tầng nghiệp vụ để xác thực và lấy token
            const token = await AuthService.loginUser(email, password, mockStoredPassword);

            // Gắn token vào Cookie bảo mật, giới hạn 1 giờ (3600000 ms)
            res.cookie('accessToken', token, {
                httpOnly: true,
                maxAge: 3600000 
            });

            res.status(200).json({
                success: true,
                message: "Đăng nhập thành công"
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = AuthController;