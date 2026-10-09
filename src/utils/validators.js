'use strict';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const isString = (v) => typeof v === 'string';
const byteLength = (s) => Buffer.byteLength(s, 'utf8');
const err = (field, code, message) => ({ field, code, message });

// Tên hiển thị mặc định: "Nguyễn Minh Linh" -> "Linh N."
const deriveDisplayName = (fullName) => {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 60);
    return `${parts[parts.length - 1]} ${parts[0][0].toUpperCase()}.`.slice(0, 60);
};

const checkName = (errors, field, label, value, min, max) => {
    if (!value) {
        errors.push(err(field, 'REQUIRED', `${label} không được để trống`));
    } else if (value.length < min || value.length > max) {
        errors.push(err(field, 'LENGTH', `${label} phải từ ${min} đến ${max} ký tự`));
    } else if (/[<>]/.test(value)) {
        errors.push(err(field, 'INVALID_CHARS', `${label} không được chứa ký tự < hoặc >`));
    }
};

function validateRegister(body) {
    const input = body && typeof body === 'object' ? body : {};
    const errors = [];

    const email = isString(input.email) ? input.email.trim().toLowerCase() : '';
    if (!email) errors.push(err('email', 'REQUIRED', 'Email không được để trống'));
    else if (email.length > 190 || !EMAIL_RE.test(email)) errors.push(err('email', 'INVALID', 'Email không hợp lệ'));

    const password = isString(input.password) ? input.password : '';
    if (!password) {
        errors.push(err('password', 'REQUIRED', 'Mật khẩu không được để trống'));
    } else if (password.length < 8) {
        errors.push(err('password', 'TOO_SHORT', 'Mật khẩu phải có ít nhất 8 ký tự'));
    } else if (byteLength(password) > 72) {
        errors.push(err('password', 'TOO_LONG', 'Mật khẩu tối đa 72 byte (giới hạn của bcrypt)'));
    } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        errors.push(err('password', 'WEAK', 'Mật khẩu phải có cả chữ cái và chữ số'));
    }

    const fullName = isString(input.fullName) ? input.fullName.trim().replace(/\s+/g, ' ') : '';
    checkName(errors, 'fullName', 'Họ tên', fullName, 2, 120);

    let displayName = isString(input.displayName) ? input.displayName.trim() : '';
    if (displayName) checkName(errors, 'displayName', 'Tên hiển thị', displayName, 2, 60);
    else if (fullName && fullName.length >= 2) displayName = deriveDisplayName(fullName);

    return { errors, value: { email, password, fullName, displayName } };
}

function validateLogin(body) {
    const input = body && typeof body === 'object' ? body : {};
    const errors = [];

    const email = isString(input.email) ? input.email.trim().toLowerCase() : '';
    if (!email) errors.push(err('email', 'REQUIRED', 'Email không được để trống'));
    else if (email.length > 190) errors.push(err('email', 'INVALID', 'Email không hợp lệ'));

    const password = isString(input.password) ? input.password : '';
    if (!password) errors.push(err('password', 'REQUIRED', 'Mật khẩu không được để trống'));
    else if (password.length > 200) errors.push(err('password', 'TOO_LONG', 'Mật khẩu quá dài'));

    return { errors, value: { email, password } };
}

module.exports = { validateRegister, validateLogin, deriveDisplayName };
