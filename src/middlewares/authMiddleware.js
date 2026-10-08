// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const UserRepository = require('../repositories/userRepository');

// Khóa bí mật và thuật toán phải trùng khớp với AuthService khi cấp phát token
const JWT_SECRET = process.env.JWT_SECRET || 'chua_khoa_bi_mat_sieu_cung';
const JWT_ALGORITHM = 'HS256';

// Tên cookie chứa token do AuthController phát hành lúc đăng nhập
const ACCESS_TOKEN_COOKIE = 'accessToken';

// Mã vai trò quản trị trong bảng roles
const ADMIN_ROLE_CODE = 'admin';

// Lấy token từ cookie bảo mật, dự phòng bằng header Authorization dạng Bearer
const extractToken = (req) => {
    if (req.cookies && req.cookies[ACCESS_TOKEN_COOKIE]) {
        return req.cookies[ACCESS_TOKEN_COOKIE];
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice('Bearer '.length).trim();
    }

    return null;
};

// Chuẩn hóa lỗi để tầng xử lý lỗi tập trung ở server.js đọc được statusCode
const createHttpError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

// Chặng 1: xác thực token và gắn thông tin người dùng vào req.user
const verifyToken = (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
        return next(createHttpError(401, 'Chưa đăng nhập: thiếu token xác thực!'));
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: [JWT_ALGORITHM] });

        req.user = {
            id: decoded.id || null,
            email: decoded.email || null,
            role: decoded.role || null
        };

        return next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return next(createHttpError(401, 'Phiên đăng nhập đã hết hạn!'));
        }

        return next(createHttpError(401, 'Token không hợp lệ!'));
    }
};

// Xác định quyền quản trị: bảng RBAC là nguồn dữ liệu chính,
// claim đã ký trong token là phương án dự phòng khi chưa gán vai trò trong CSDL.
const isGrantedAdmin = async (user) => {
    if (!user) return false;

    let userId = user.id;
    if (!userId && user.email) {
        userId = await UserRepository.findIdByEmail(user.email);
    }

    if (userId && (await UserRepository.hasRole(userId, ADMIN_ROLE_CODE))) {
        return true;
    }

    return user.role === ADMIN_ROLE_CODE;
};

// Chặng 2: chỉ cho phép tài khoản có vai trò quản trị đi tiếp
const isAdmin = async (req, res, next) => {
    if (!req.user) {
        return next(createHttpError(401, 'Chưa đăng nhập!'));
    }

    try {
        const granted = await isGrantedAdmin(req.user);

        if (!granted) {
            return next(createHttpError(403, 'Bạn không có quyền truy cập chức năng quản trị!'));
        }

        return next();
    } catch (error) {
        return next(error);
    }
};

module.exports = { verifyToken, isAdmin };
