'use strict';
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const HttpError = require('../utils/httpError');
const { validateRegister, validateLogin } = require('../utils/validators');
const UserRepository = require('../repositories/userRepository');
const AuditLogService = require('./auditLogService');

const DEFAULT_ROLE = 'USER';
// Băm giả để thời gian phản hồi khi email không tồn tại gần bằng khi email tồn tại.
const DUMMY_HASH = bcrypt.hashSync('khong-phai-mat-khau-that', env.bcryptRounds);

class AuthService {
    static async register(body, ip) {
        const { errors, value } = validateRegister(body);
        if (errors.length) {
            throw HttpError.unprocessable('Dữ liệu đăng ký không hợp lệ', errors);
        }

        const passwordHash = await bcrypt.hash(value.password, env.bcryptRounds);

        let userId;
        try {
            userId = await UserRepository.createWithRole({
                email: value.email,
                passwordHash,
                fullName: value.fullName,
                displayName: value.displayName,
                roleCode: DEFAULT_ROLE
            });
        } catch (error) {
            if (error && error.code === 'ER_DUP_ENTRY') {
                throw HttpError.conflict('Email này đã được đăng ký', 'EMAIL_TAKEN');
            }
            throw error;
        }

        await AuditLogService.logAction(userId, 'REGISTER', 'users', userId, ip);
        return { id: userId, email: value.email, displayName: value.displayName };
    }

    static async login(body, ip) {
        const { errors, value } = validateLogin(body);
        if (errors.length) {
            throw HttpError.unprocessable('Thiếu thông tin đăng nhập', errors);
        }

        const user = await UserRepository.findByEmail(value.email);

        if (user && Number(user.is_temp_locked)) {
            await AuditLogService.logAction(user.id, 'LOGIN_FAILED', 'users', user.id, ip);
            throw HttpError.tooManyRequests(
                'Tài khoản tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.',
                'TOO_MANY_ATTEMPTS'
            );
        }

        const passwordOk = await bcrypt.compare(value.password, user ? user.password_hash : DUMMY_HASH);

        if (!user || !passwordOk) {
            if (user) {
                const nowLocked = await UserRepository.registerFailedLogin(
                    user.id, env.login.maxAttempts, env.login.lockMinutes
                );
                if (nowLocked) {
                    await AuditLogService.logAction(user.id, 'ACCOUNT_LOCKED', 'users', user.id, ip);
                }
            }
            await AuditLogService.logAction(user ? user.id : null, 'LOGIN_FAILED', 'users', user ? user.id : null, ip);
            throw HttpError.unauthorized('Email hoặc mật khẩu không chính xác', 'INVALID_CREDENTIALS');
        }

        // Chỉ tiết lộ trạng thái tài khoản sau khi mật khẩu đã đúng.
        if (user.status !== 'active') {
            await AuditLogService.logAction(user.id, 'LOGIN_FAILED', 'users', user.id, ip);
            throw HttpError.forbidden('Tài khoản đã bị khóa hoặc chưa được kích hoạt', 'ACCOUNT_DISABLED');
        }

        await UserRepository.recordSuccessfulLogin(user.id);

        const token = jwt.sign(
            { sub: String(user.id), email: user.email, tv: Number(user.token_version) },
            env.jwt.secret,
            { algorithm: env.jwt.algorithm, expiresIn: env.jwt.expiresIn }
        );

        await AuditLogService.logAction(user.id, 'LOGIN_SUCCESS', 'users', user.id, ip);
        return { token, user: { id: user.id, email: user.email, displayName: user.display_name } };
    }

    // Đăng xuất thật sự: thu hồi mọi token đã cấp, không chỉ xóa cookie phía trình duyệt.
    static async logout(userId, ip) {
        await UserRepository.revokeTokens(userId);
        await AuditLogService.logAction(userId, 'LOGOUT', 'users', userId, ip);
    }
}

module.exports = AuthService;
