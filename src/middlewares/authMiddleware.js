'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const HttpError = require('../utils/httpError');
const UserRepository = require('../repositories/userRepository');

const ACCESS_TOKEN_COOKIE = 'accessToken';

const extractToken = (req) => {
    if (req.cookies && req.cookies[ACCESS_TOKEN_COOKIE]) return req.cookies[ACCESS_TOKEN_COOKIE];
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
    return null;
};

// Xác thực đầy đủ: chữ ký + hạn token, rồi đối chiếu CSDL (tài khoản còn hoạt động, token đúng phiên bản).
// Nhờ vậy khóa tài khoản và đăng xuất có hiệu lực ngay, không phải chờ token hết hạn.
const authenticate = async (req) => {
    const token = extractToken(req);
    if (!token) throw HttpError.unauthorized('Chưa đăng nhập', 'UNAUTHENTICATED');

    let decoded;
    try {
        decoded = jwt.verify(token, env.jwt.secret, { algorithms: [env.jwt.algorithm] });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw HttpError.unauthorized('Phiên đăng nhập đã hết hạn', 'TOKEN_EXPIRED');
        }
        throw HttpError.unauthorized('Token không hợp lệ', 'INVALID_TOKEN');
    }

    const userId = Number(decoded.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
        throw HttpError.unauthorized('Token không hợp lệ', 'INVALID_TOKEN');
    }

    const context = await UserRepository.findAuthContextById(userId);
    if (!context) throw HttpError.unauthorized('Token không hợp lệ', 'INVALID_TOKEN');
    if (context.status !== 'active') {
        throw HttpError.forbidden('Tài khoản đã bị khóa hoặc chưa được kích hoạt', 'ACCOUNT_DISABLED');
    }

    // Token chỉ hợp lệ khi mang đúng số phiên bản hiện tại của tài khoản.
    // Token cũ (không có 'tv') hoặc phát trước lần đăng xuất gần nhất đều bị thu hồi.
    if (decoded.tv !== context.tokenVersion) {
        throw HttpError.unauthorized('Phiên đăng nhập đã bị thu hồi', 'TOKEN_REVOKED');
    }

    return context;
};

// Bắt buộc đăng nhập
const verifyToken = async (req, res, next) => {
    try {
        req.user = await authenticate(req);
        next();
    } catch (error) {
        next(error);
    }
};

// Đăng nhập không bắt buộc (trang công khai có cá nhân hóa): lỗi xác thực => coi như khách.
const optionalAuth = async (req, res, next) => {
    try {
        req.user = await authenticate(req);
    } catch (error) {
        req.user = null;
        if (!(error instanceof HttpError) || error.statusCode >= 500) return next(error);
    }
    next();
};

// Kiểm soát quyền ở MÁY CHỦ theo bảng role_permissions (không dựa vào ẩn hiện giao diện).
const authorize = (permission) => (req, res, next) => {
    if (!req.user) return next(HttpError.unauthorized('Chưa đăng nhập', 'UNAUTHENTICATED'));
    if (!req.user.permissions.includes(permission)) {
        return next(HttpError.forbidden('Bạn không có quyền thực hiện thao tác này', 'FORBIDDEN'));
    }
    return next();
};

const requireRole = (...roleCodes) => (req, res, next) => {
    if (!req.user) return next(HttpError.unauthorized('Chưa đăng nhập', 'UNAUTHENTICATED'));
    if (!roleCodes.some((code) => req.user.roles.includes(code))) {
        return next(HttpError.forbidden('Bạn không có quyền thực hiện thao tác này', 'FORBIDDEN'));
    }
    return next();
};

// Tương thích mã cũ: isAdmin = chỉ vai trò ADMIN
const isAdmin = requireRole('ADMIN');

module.exports = { verifyToken, optionalAuth, authorize, requireRole, isAdmin, ACCESS_TOKEN_COOKIE };
