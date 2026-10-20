'use strict';
// Kiểm tra đầu vào ở phía máy chủ cho tài khoản, quản trị người dùng, thể loại và nhân vật.
const issue = (field, message) => ({ field, code: 'INVALID', message });
const isStr = (v) => typeof v === 'string';
const HAS_MARKUP = /[<>]/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

// Cùng quy tắc với đăng ký: 8 ký tự trở lên, tối đa 72 byte (giới hạn của bcrypt), có cả chữ cái và chữ số.
function checkPassword(value, field, errors) {
    if (!isStr(value) || !value) { errors.push(issue(field, 'Mật khẩu không được để trống')); return; }
    if (value.length < 8) errors.push(issue(field, 'Mật khẩu phải có ít nhất 8 ký tự'));
    else if (Buffer.byteLength(value, 'utf8') > 72) errors.push(issue(field, 'Mật khẩu tối đa 72 byte'));
    else if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) errors.push(issue(field, 'Mật khẩu phải có cả chữ cái và chữ số'));
}

function checkName(value, field, label, min, max, errors) {
    const v = isStr(value) ? value.trim() : '';
    if (v.length < min || v.length > max) errors.push(issue(field, `${label} từ ${min} đến ${max} ký tự`));
    else if (HAS_MARKUP.test(v)) errors.push(issue(field, `${label} không được chứa ký tự < hoặc >`));
    return v;
}

function validateChangePassword(body = {}) {
    const errors = [];
    if (!isStr(body.currentPassword) || !body.currentPassword || body.currentPassword.length > 200) errors.push(issue('currentPassword', 'Bắt buộc nhập mật khẩu hiện tại'));
    checkPassword(body.newPassword, 'newPassword', errors);
    if (isStr(body.currentPassword) && body.currentPassword === body.newPassword) errors.push(issue('newPassword', 'Mật khẩu mới phải khác mật khẩu hiện tại'));
    return { errors, value: { currentPassword: body.currentPassword, newPassword: body.newPassword } };
}

function validateProfile(body = {}) {
    const errors = []; const value = {};
    if (body.fullName === undefined && body.displayName === undefined) errors.push(issue('fullName', 'Cần gửi ít nhất một trường fullName hoặc displayName'));
    if (body.fullName !== undefined) value.fullName = checkName(body.fullName, 'fullName', 'Họ và tên', 2, 120, errors);
    if (body.displayName !== undefined) value.displayName = checkName(body.displayName, 'displayName', 'Tên hiển thị', 2, 60, errors);
    return { errors, value };
}

function validateForgot(body = {}) {
    const errors = [];
    const email = isStr(body.email) ? body.email.trim().toLowerCase() : '';
    if (!EMAIL.test(email) || email.length > 190) errors.push(issue('email', 'Thư điện tử không hợp lệ'));
    return { errors, value: { email } };
}

function validateReset(body = {}) {
    const errors = [];
    const token = isStr(body.token) ? body.token.trim().toLowerCase() : '';
    if (!/^[a-f0-9]{64}$/.test(token)) errors.push(issue('token', 'Mã đặt lại không đúng định dạng'));
    checkPassword(body.newPassword, 'newPassword', errors);
    return { errors, value: { token, newPassword: body.newPassword } };
}

const ASSIGNABLE_ROLES = ['ADMIN', 'MODERATOR', 'USER'];
function validateRoleChange(body = {}) {
    const errors = [];
    if (!ASSIGNABLE_ROLES.includes(body.role)) errors.push(issue('role', `Vai trò phải thuộc ${ASSIGNABLE_ROLES.join(', ')}`));
    return { errors, value: { role: body.role } };
}

function validateUserQuery(query = {}) {
    const errors = []; const value = {};
    if (query.q !== undefined && query.q !== '') {
        const q = isStr(query.q) ? query.q.trim() : '';
        if (!q || q.length > 100) errors.push(issue('q', 'Từ khóa tối đa 100 ký tự')); else value.q = q;
    }
    if (query.status !== undefined && query.status !== '') {
        if (!['active', 'locked', 'pending'].includes(query.status)) errors.push(issue('status', 'status thuộc active, locked, pending')); else value.status = query.status;
    }
    if (query.role !== undefined && query.role !== '') {
        if (!['ADMIN', 'MODERATOR', 'USER'].includes(query.role)) errors.push(issue('role', 'role thuộc ADMIN, MODERATOR, USER')); else value.role = query.role;
    }
    return { errors, value };
}

function validateGenre(body = {}) {
    const errors = [];
    const code = isStr(body.code) ? body.code.trim().toLowerCase() : '';
    if (!/^[a-z0-9_-]{2,32}$/.test(code)) errors.push(issue('code', 'Mã gồm 2–32 ký tự a-z, 0-9, _ hoặc -'));
    const name = checkName(body.name, 'name', 'Tên thể loại', 2, 120, errors);
    const appliesTo = body.appliesTo === undefined ? 'both' : body.appliesTo;
    if (!['movie', 'book', 'both'].includes(appliesTo)) errors.push(issue('appliesTo', 'appliesTo thuộc movie, book, both'));
    return { errors, value: { code, name, appliesTo } };
}

function validatePerson(body = {}) {
    const errors = [];
    const fullName = checkName(body.fullName, 'fullName', 'Họ và tên', 2, 120, errors);
    let birthYear = null;
    if (body.birthYear !== undefined && body.birthYear !== null && body.birthYear !== '') {
        birthYear = Number(body.birthYear);
        if (!Number.isInteger(birthYear) || birthYear < 1800 || birthYear > 2100) errors.push(issue('birthYear', 'Năm sinh từ 1800 đến 2100'));
    }
    let country = null;
    if (body.country !== undefined && body.country !== null && body.country !== '') {
        country = isStr(body.country) ? body.country.trim() : '';
        if (!country || country.length > 60 || HAS_MARKUP.test(country)) { errors.push(issue('country', 'Quốc gia tối đa 60 ký tự, không chứa < hoặc >')); country = null; }
    }
    return { errors, value: { fullName, birthYear, country } };
}

module.exports = { validateChangePassword, validateProfile, validateForgot, validateReset, validateRoleChange, validateUserQuery, validateGenre, validatePerson, ASSIGNABLE_ROLES };
