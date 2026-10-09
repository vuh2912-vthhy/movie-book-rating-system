#!/usr/bin/env node
'use strict';
/**
 * Kiểm thử khói cho xác thực và phân quyền (Buổi 04 / Ngày 1).
 *   node scripts/smoke-auth.js                       -> http://localhost:3000
 *   node scripts/smoke-auth.js https://ten-mien.app  -> môi trường trực tuyến
 * Tùy chọn kiểm tra tài khoản quản trị:
 *   ADMIN_EMAIL=admin01@demo.local ADMIN_PASSWORD='...' node scripts/smoke-auth.js
 * Mỗi lần chạy tạo 1 tài khoản smoke_<thời điểm>@demo.local (vai trò USER) để thử.
 * Cần Node 18 trở lên. Chụp ảnh màn hình kết quả làm bằng chứng.
 */
const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const API = `${BASE}/api/v1`;
const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS || '5', 10);

let passed = 0;
let failed = 0;
const check = (name, condition, detail = '') => {
    if (condition) passed += 1; else failed += 1;
    console.log(`${condition ? '  ĐẠT ' : '  LỖI '} ${name}${condition ? '' : `  -> ${detail}`}`);
};

async function call(method, path, { body, raw, cookie } = {}) {
    const headers = {};
    if (body !== undefined || raw !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(API + path, {
        method,
        headers,
        body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'manual'
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* phản hồi không phải JSON */ }
    const setCookies = typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
    return { status: res.status, json, setCookies };
}

const tokenCookie = (setCookies) => {
    const found = setCookies.find((c) => c.startsWith('accessToken='));
    return found ? found.split(';')[0] : null;
};
const errCode = (r) => (r.json && r.json.error ? r.json.error.code : undefined);

(async () => {
    console.log(`\nKiểm thử xác thực tại ${API}\n`);
    const email = `smoke_${Date.now()}@demo.local`;
    const password = 'MatKhau12345';

    console.log('1. Hệ thống và định dạng lỗi');
    let r = await call('GET', '/health');
    check('GET /health trả 200', r.status === 200, `status ${r.status}`);
    r = await call('GET', '/khong-ton-tai');
    check('Đường dẫn lạ trả 404 đúng cấu trúc lỗi', r.status === 404 && errCode(r) === 'NOT_FOUND', `status ${r.status}`);
    r = await call('POST', '/auth/login', { raw: '{"email": ' });
    check('JSON hỏng trả 400 INVALID_JSON', r.status === 400 && errCode(r) === 'INVALID_JSON', `status ${r.status} ${errCode(r)}`);

    console.log('\n2. Đăng ký');
    r = await call('POST', '/auth/register', { body: { email, password: 'abc', fullName: 'Nguyen Smoke' } });
    check('Mật khẩu yếu bị từ chối 422', r.status === 422 && errCode(r) === 'VALIDATION_FAILED', `status ${r.status}`);
    r = await call('POST', '/auth/register', { body: { email, password, fullName: 'Nguyen Smoke' } });
    check('Đăng ký hợp lệ trả 201', r.status === 201, `status ${r.status} ${JSON.stringify(r.json)}`);
    r = await call('POST', '/auth/register', { body: { email, password, fullName: 'Nguyen Smoke' } });
    check('Đăng ký trùng email trả 409', r.status === 409 && errCode(r) === 'EMAIL_TAKEN', `status ${r.status}`);

    console.log('\n3. Đăng nhập');
    r = await call('POST', '/auth/login', { body: { email, password: 'SaiMatKhau99' } });
    check('Sai mật khẩu trả 401 INVALID_CREDENTIALS', r.status === 401 && errCode(r) === 'INVALID_CREDENTIALS', `status ${r.status}`);
    r = await call('POST', '/auth/login', { body: { email: 'khong.ton.tai@demo.local', password } });
    check('Email không tồn tại trả cùng lỗi (không lộ tài khoản)', r.status === 401 && errCode(r) === 'INVALID_CREDENTIALS', `status ${r.status}`);
    r = await call('POST', '/auth/login', { body: { email, password } });
    const cookie = tokenCookie(r.setCookies);
    check('Đăng nhập đúng trả 200 và phát cookie', r.status === 200 && Boolean(cookie), `status ${r.status}`);
    const flags = (r.setCookies.find((c) => c.startsWith('accessToken=')) || '').toLowerCase();
    check('Cookie có HttpOnly và SameSite=Strict (BM7)', flags.includes('httponly') && flags.includes('samesite=strict'), flags);
    if (BASE.startsWith('https://')) check('Cookie có Secure trên HTTPS (BM7)', flags.includes('secure'), flags);
    check('Phản hồi không chứa token hay mã băm', !JSON.stringify(r.json).match(/eyJ|\$2[aby]\$/), 'lộ dữ liệu nhạy cảm');

    console.log('\n4. Phân quyền phía máy chủ');
    r = await call('GET', '/auth/me', { cookie });
    check('GET /auth/me trả 200, vai trò USER', r.status === 200 && r.json.data.roles.includes('USER'), `status ${r.status}`);
    check('USER có quyền rating.create, không có audit.read',
        r.status === 200 && r.json.data.permissions.includes('rating.create') && !r.json.data.permissions.includes('audit.read'));
    r = await call('GET', '/auth/me');
    check('Không cookie trả 401', r.status === 401 && errCode(r) === 'UNAUTHENTICATED', `status ${r.status}`);
    r = await call('GET', '/admin/system-logs', { cookie });
    check('USER gọi API quản trị trả 403 (BM5)', r.status === 403 && errCode(r) === 'FORBIDDEN', `status ${r.status}`);
    r = await call('GET', '/admin/system-logs');
    check('Khách gọi API quản trị trả 401', r.status === 401, `status ${r.status}`);
    r = await call('GET', '/auth/me', { cookie: cookie ? cookie.slice(0, -2) + 'xx' : 'accessToken=x' });
    check('Token bị sửa trả 401 INVALID_TOKEN', r.status === 401 && errCode(r) === 'INVALID_TOKEN', `status ${r.status} ${errCode(r)}`);

    console.log('\n5. Đăng xuất thu hồi token');
    r = await call('POST', '/auth/logout', { cookie });
    check('Đăng xuất trả 200', r.status === 200, `status ${r.status}`);
    r = await call('GET', '/auth/me', { cookie });
    check('Dùng lại token cũ sau đăng xuất bị 401 TOKEN_REVOKED', r.status === 401 && errCode(r) === 'TOKEN_REVOKED', `status ${r.status} ${errCode(r)}`);

    console.log(`\n6. Chống dò mật khẩu (khóa sau ${MAX_ATTEMPTS} lần sai) - BM10`);
    for (let i = 1; i <= MAX_ATTEMPTS; i += 1) {
        r = await call('POST', '/auth/login', { body: { email, password: `Sai${i}MatKhau` } });
    }
    check(`Lần sai thứ ${MAX_ATTEMPTS} vẫn trả 401`, r.status === 401, `status ${r.status}`);
    r = await call('POST', '/auth/login', { body: { email, password } });
    check('Đúng mật khẩu nhưng đang bị khóa tạm trả 429', r.status === 429 && errCode(r) === 'TOO_MANY_ATTEMPTS', `status ${r.status} ${errCode(r)}`);

    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
        console.log('\n7. Tài khoản quản trị');
        r = await call('POST', '/auth/login', { body: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } });
        const adminCookie = tokenCookie(r.setCookies);
        check('Admin đăng nhập 200', r.status === 200 && Boolean(adminCookie), `status ${r.status}`);
        r = await call('GET', '/admin/system-logs?page=1&size=5', { cookie: adminCookie });
        check('Admin xem nhật ký hệ thống 200, có phân trang',
            r.status === 200 && Array.isArray(r.json.data) && Boolean(r.json.pagination), `status ${r.status}`);
        r = await call('GET', '/auth/me', { cookie: adminCookie });
        check('Admin có quyền audit.read', r.status === 200 && r.json.data.permissions.includes('audit.read'));
    } else {
        console.log('\n7. (Bỏ qua) Đặt ADMIN_EMAIL và ADMIN_PASSWORD để kiểm tra tài khoản quản trị.');
    }

    console.log(`\nKết quả: ${passed} đạt, ${failed} lỗi`);
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error('Không chạy được kiểm thử:', error.message);
    process.exit(1);
});
