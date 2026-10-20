'use strict';
// Nghiệp vụ tài khoản của chính người dùng: hồ sơ, đổi mật khẩu, quên và đặt lại mật khẩu (mô phỏng gửi thư).
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const env = require('../config/env');
const HttpError = require('../utils/httpError');
const { validateChangePassword, validateProfile, validateForgot, validateReset } = require('../utils/accountValidators');
const UserRepository = require('../repositories/userRepository');
const PasswordResetRepository = require('../repositories/passwordResetRepository');
const AuditLogService = require('./auditLogService');

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const fail = (message, errors) => { if (errors.length) throw HttpError.unprocessable(message, errors); };
const toProfile = (c) => ({ id: c.id, email: c.email, fullName: c.fullName, displayName: c.displayName, roles: c.roles });

class AccountService {
    static async getProfile(user) {
        const ctx = await UserRepository.findAuthContextById(user.id);
        if (!ctx) throw HttpError.unauthorized('Phiên không hợp lệ', 'INVALID_TOKEN');
        return toProfile(ctx);
    }

    static async updateProfile(user, body, ip) {
        const { errors, value } = validateProfile(body);
        fail('Hồ sơ không hợp lệ', errors);
        await UserRepository.updateProfile(user.id, value);
        await AuditLogService.logAction(user.id, 'PROFILE_UPDATE', 'users', user.id, ip);
        return AccountService.getProfile(user);
    }

    // Đổi mật khẩu: xác minh mật khẩu hiện tại; thành công thì mọi thẻ đang dùng (kể cả thẻ hiện tại) bị thu hồi.
    static async changePassword(user, body, ip) {
        const { errors, value } = validateChangePassword(body);
        fail('Dữ liệu đổi mật khẩu không hợp lệ', errors);
        const row = await UserRepository.findPasswordHashById(user.id);
        if (!row) throw HttpError.unauthorized('Phiên không hợp lệ', 'INVALID_TOKEN');
        const ok = await bcrypt.compare(value.currentPassword, row.password_hash);
        if (!ok) {
            await AuditLogService.logAction(user.id, 'PASSWORD_CHANGE_REJECTED', 'users', user.id, ip);
            throw HttpError.unprocessable('Mật khẩu hiện tại không đúng', [{ field: 'currentPassword', code: 'INVALID', message: 'Mật khẩu hiện tại không đúng' }], 'CURRENT_PASSWORD_INVALID');
        }
        const hash = await bcrypt.hash(value.newPassword, env.bcryptRounds);
        await UserRepository.updatePassword(user.id, hash);
        await AuditLogService.logAction(user.id, 'PASSWORD_CHANGE', 'users', user.id, ip);
    }

    // Quên mật khẩu: luôn trả cùng một thông điệp dù email có tồn tại hay không.
    // Chỉ lưu BĂM của mã; mã gốc chỉ xuất hiện trong "thư mô phỏng" (khi MAIL_SIMULATION=true).
    static async forgotPassword(body, ip) {
        const { errors, value } = validateForgot(body);
        fail('Thư điện tử không hợp lệ', errors);
        const out = { message: 'Nếu thư điện tử đã đăng ký, hướng dẫn đặt lại mật khẩu đã được gửi.' };
        const user = await UserRepository.findActiveByEmail(value.email);
        if (!user) return out;
        const token = crypto.randomBytes(32).toString('hex');
        await PasswordResetRepository.create(user.id, sha256(token), env.account.resetTtlMinutes);
        await AuditLogService.logAction(user.id, 'PASSWORD_RESET_REQUEST', 'users', user.id, ip);
        if (env.account.simulateMail) {
            out.simulatedEmail = { to: user.email, resetCode: token, expiresInMinutes: env.account.resetTtlMinutes, note: 'Mô phỏng gửi thư: hệ thống học tập không có dịch vụ SMTP' };
        }
        return out;
    }

    static async resetPassword(body, ip) {
        const { errors, value } = validateReset(body);
        fail('Dữ liệu đặt lại mật khẩu không hợp lệ', errors);
        const hash = await bcrypt.hash(value.newPassword, env.bcryptRounds);
        const userId = await PasswordResetRepository.consumeAndSetPassword(sha256(value.token), hash);
        if (!userId) {
            throw HttpError.unprocessable('Mã đặt lại không hợp lệ, đã dùng hoặc đã hết hạn', [{ field: 'token', code: 'INVALID', message: 'Mã không hợp lệ hoặc đã hết hạn' }], 'RESET_TOKEN_INVALID');
        }
        await AuditLogService.logAction(userId, 'PASSWORD_RESET', 'users', userId, ip);
    }
}

module.exports = AccountService;
