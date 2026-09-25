const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
// Giả lập model UserRepository (bạn sẽ gọi db thực tế ở Bước sau)
// const UserRepository = require('../repositories/userRepository');

class AuthService {
    static async registerUser(email, plainPassword) {
        // Thuật toán bcrypt kết hợp muối (salt) 10 vòng
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
        
        // TODO: Gọi UserRepository.create(email, hashedPassword) để lưu vào DB
        
        return hashedPassword; // Trả về để test
    }

    static async loginUser(email, plainPassword, storedHashedPassword) {
        // So sánh mật khẩu người dùng nhập với chuỗi băm trong DB
        const isMatch = await bcrypt.compare(plainPassword, storedHashedPassword);
        if (!isMatch) {
            const error = new Error('Sai thông tin đăng nhập');
            error.statusCode = 401;
            throw error;
        }

        // Cấp phát Token với thuật toán HS256 theo yêu cầu của giáo viên
        const token = jwt.sign(
            { email: email, role: 'user' }, 
            process.env.JWT_SECRET || 'chua_khoa_bi_mat_sieu_cung', 
            { 
                expiresIn: '1h',
                algorithm: 'HS256' // Khai báo tường minh thuật toán
            }
        );
        return token;
    }
}

module.exports = AuthService;