'use strict';
// Quản trị người dùng (ADMIN): tra cứu, khóa/mở khóa, đổi vai trò.
const HttpError = require('../utils/httpError');
const { parseId, parsePagination, buildPagination } = require('../utils/params');
const { validateUserQuery, validateRoleChange } = require('../utils/accountValidators');
const UserRepository = require('../repositories/userRepository');
const AuditLogService = require('./auditLogService');

const toDto = (u) => ({
    id: u.id, email: u.email, fullName: u.full_name, displayName: u.display_name, status: u.status,
    roles: u.roles ? String(u.roles).split(',') : [], createdAt: u.created_at, lastLoginAt: u.last_login_at
});
const notFound = () => HttpError.notFound('Không tìm thấy người dùng', 'USER_NOT_FOUND');

class UserAdminService {
    static async list(query) {
        const { errors, value } = validateUserQuery(query);
        if (errors.length) throw HttpError.unprocessable('Tham số lọc không hợp lệ', errors);
        const pg = parsePagination(query, { defaultSize: 20, maxSize: 50 });
        const { rows, total } = await UserRepository.listPaginated(value, pg.size, pg.offset);
        return { items: rows.map(toDto), pagination: buildPagination(pg, total) };
    }

    static async lock(admin, idRaw, ip) {
        const id = parseId(idRaw);
        if (id === admin.id) throw HttpError.unprocessable('Không thể tự khóa tài khoản của mình', [], 'CANNOT_LOCK_SELF');
        const target = await UserRepository.findSummaryById(id);
        if (!target) throw notFound();
        if (target.status !== 'locked') {
            await UserRepository.setStatus(id, 'locked');
            await AuditLogService.logAction(admin.id, 'USER_LOCK', 'users', id, ip);
        }
        return toDto(await UserRepository.findSummaryById(id));
    }

    static async unlock(admin, idRaw, ip) {
        const id = parseId(idRaw);
        const target = await UserRepository.findSummaryById(id);
        if (!target) throw notFound();
        if (target.status !== 'active') {
            await UserRepository.setStatus(id, 'active');
            await AuditLogService.logAction(admin.id, 'USER_UNLOCK', 'users', id, ip);
        }
        return toDto(await UserRepository.findSummaryById(id));
    }

    static async setRole(admin, idRaw, body, ip) {
        const id = parseId(idRaw);
        const { errors, value } = validateRoleChange(body);
        if (errors.length) throw HttpError.unprocessable('Vai trò không hợp lệ', errors);
        if (id === admin.id && value.role !== 'ADMIN') {
            throw HttpError.unprocessable('Không thể tự hạ quyền của chính mình', [], 'CANNOT_DEMOTE_SELF');
        }
        const result = await UserRepository.replaceRole(id, value.role);
        if (result.notFound) throw notFound();
        if (result.lastAdmin) throw HttpError.conflict('Phải còn ít nhất một quản trị viên đang hoạt động', 'LAST_ADMIN');
        await AuditLogService.logAction(admin.id, 'USER_ROLE_CHANGE', 'users', id, ip);
        return toDto(await UserRepository.findSummaryById(id));
    }
}

module.exports = UserAdminService;
