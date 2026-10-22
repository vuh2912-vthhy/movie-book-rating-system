'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv } = require('../../src/utils/csv');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const API = `${BASE}/api/v1`;
const PW = 'MatKhau12345';
const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const emailA = `apitest_${stamp}_a@demo.local`;
const emailB = `apitest_${stamp}_b@demo.local`;
const emailLock = `apitest_${stamp}_lock@demo.local`;
const strip = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

async function http(method, path, { body, cookie, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (cookie) h.Cookie = cookie;
    const res = await fetch(API + path, { method, headers: h, body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* không phải JSON */ }
    const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const sc = setCookie.find((c) => c.startsWith('accessToken='));
    return { status: res.status, json, text, headers: res.headers, setCookie, cookie: sc ? sc.split(';')[0] : null };
}
const code = (r) => r.json && r.json.error && r.json.error.code;
async function login(email, password) { const r = await http('POST', '/auth/login', { body: { email, password } }); return r; }

const S = { cookieA: null, cookieB: null, title: null, reviewId: null, mod: null, admin: null };
const needMod = process.env.MOD_EMAIL && process.env.MOD_PASSWORD ? false : 'thiếu MOD_EMAIL, MOD_PASSWORD';
const needAdmin = process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD ? false : 'thiếu ADMIN_EMAIL, ADMIN_PASSWORD';

test('TC-01 Đăng ký tài khoản mới trả 201', async () => {
    const r = await http('POST', '/auth/register', { body: { email: emailA, password: PW, fullName: 'Nguyen Van Test' } });
    assert.equal(r.status, 201, r.text);
    await http('POST', '/auth/register', { body: { email: emailB, password: PW, fullName: 'Tran Thi Test' } });
});
test('TC-02 Đăng nhập đúng: 200 và cookie HttpOnly, SameSite=Strict', async () => {
    const r = await login(emailA, PW);
    assert.equal(r.status, 200, r.text);
    const sc = r.setCookie.find((c) => c.startsWith('accessToken='));
    assert.ok(/HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc), sc);
    S.cookieA = r.cookie; S.cookieB = (await login(emailB, PW)).cookie;
    assert.ok(S.cookieA && S.cookieB);
});
test('TC-03 /auth/me trả đúng email và vai trò USER, không có mã băm mật khẩu', async () => {
    const r = await http('GET', '/auth/me', { cookie: S.cookieA });
    assert.equal(r.status, 200); assert.equal(r.json.data.email, emailA); assert.ok(r.json.data.roles.includes('USER'));
    assert.ok(!/password_hash|passwordHash/i.test(r.text));
});
test('TC-04 Danh sách tác phẩm có phân trang phía máy chủ', async () => {
    const r = await http('GET', '/titles?page=1&size=5');
    assert.equal(r.status, 200); assert.ok(r.json.data.length >= 1 && r.json.data.length <= 5);
    assert.equal(r.json.pagination.page, 1); assert.ok(r.json.pagination.total >= r.json.data.length);
    S.title = r.json.data[0];
});
test('TC-05 Tìm kiếm không dấu tìm thấy chính tác phẩm đó', async () => {
    const kw = strip(S.title.title);
    const r = await http('GET', `/titles?keyword=${encodeURIComponent(kw)}&size=50`);
    assert.equal(r.status, 200); assert.ok(r.json.data.some((t) => t.id === S.title.id), `không thấy "${kw}"`);
});
test('TC-06 Chấm điểm lần đầu 201, chấm lại 200 và không tăng số lượt chấm (mỗi người một điểm)', async () => {
    const a = await http('PUT', `/titles/${S.title.id}/rating`, { body: { score: 4 }, cookie: S.cookieA });
    assert.equal(a.status, 201, a.text);
    const before = (await http('GET', `/titles/${S.title.id}`)).json.data.stats.ratingCount;
    const b = await http('PUT', `/titles/${S.title.id}/rating`, { body: { score: 5 }, cookie: S.cookieA });
    assert.equal(b.status, 200, b.text);
    const after = (await http('GET', `/titles/${S.title.id}`)).json.data.stats.ratingCount;
    assert.equal(after, before);
});
test('TC-07 Gửi bình luận: 201, trạng thái chờ duyệt, chưa hiện công khai', async () => {
    const r = await http('POST', `/titles/${S.title.id}/reviews`, { body: { body: 'Bộ phim rất hay, đáng xem lại nhiều lần.' }, cookie: S.cookieA });
    assert.equal(r.status, 201, r.text);
    const mine = await http('GET', `/titles/${S.title.id}/reviews/mine`, { cookie: S.cookieA });
    assert.equal(mine.json.data.status, 'pending'); S.reviewId = mine.json.data.id;
    const pub = await http('GET', `/titles/${S.title.id}/reviews`);
    assert.ok(!pub.json.data.some((x) => x.id === S.reviewId));
});
test('TC-08 MODERATOR duyệt bình luận: 200, chuyển sang approved và hiện công khai', { skip: needMod }, async () => {
    const m = await login(process.env.MOD_EMAIL, process.env.MOD_PASSWORD); assert.equal(m.status, 200, m.text); S.mod = m.cookie;
    const r = await http('POST', `/moderation/reviews/${S.reviewId}/moderate`, { body: { action: 'approve' }, cookie: S.mod });
    assert.equal(r.status, 200, r.text);
    const pub = await http('GET', `/titles/${S.title.id}/reviews?size=50`);
    assert.ok(pub.json.data.some((x) => x.id === S.reviewId));
});
test('TC-09 Thêm vào danh sách theo dõi và đọc lại', async () => {
    const r = await http('PUT', `/me/watchlist/${S.title.id}`, { body: { listType: 'want' }, cookie: S.cookieA });
    assert.ok([200, 201].includes(r.status), r.text);
    const list = await http('GET', '/me/watchlist', { cookie: S.cookieA });
    assert.equal(list.status, 200); assert.ok(JSON.stringify(list.json.data).includes(String(S.title.id)));
});
test('TC-10 Bảng xếp hạng công khai sắp xếp giảm dần theo điểm có xét độ tin cậy', async () => {
    const r = await http('GET', '/stats/ranking?limit=10');
    assert.equal(r.status, 200); const s = r.json.data.map((x) => x.weightedScore);
    assert.ok(s.length >= 1); for (let i = 1; i < s.length; i += 1) assert.ok(s[i - 1] >= s[i], `thứ tự sai ở ${i}`);
});

test('TC-11 Điểm ngoài khoảng hoặc sai kiểu bị từ chối 422', async () => {
    for (const score of [0, 6, -1, 'abc', 3.5, null]) {
        const r = await http('PUT', `/titles/${S.title.id}/rating`, { body: { score }, cookie: S.cookieB });
        assert.equal(r.status, 422, `score=${JSON.stringify(score)} -> ${r.status}`);
    }
});
test('TC-12 Bình luận quá ngắn hoặc để trống bị từ chối 422', async () => {
    for (const body of ['', 'ngan', '   ']) {
        const r = await http('POST', `/titles/${S.title.id}/reviews`, { body: { body }, cookie: S.cookieB });
        assert.equal(r.status, 422, `body=${JSON.stringify(body)} -> ${r.status}`);
    }
});
test('TC-13 Đăng ký trùng email trả 409; mật khẩu yếu hoặc email sai định dạng trả 422', async () => {
    assert.equal((await http('POST', '/auth/register', { body: { email: emailA, password: PW, fullName: 'Nguyen Van Test' } })).status, 409);
    assert.equal((await http('POST', '/auth/register', { body: { email: `x_${stamp}@demo.local`, password: '12345678', fullName: 'Nguyen Van A' } })).status, 422);
    assert.equal((await http('POST', '/auth/register', { body: { email: 'khong-phai-email', password: PW, fullName: 'Nguyen Van A' } })).status, 422);
});
test('TC-14 Đăng nhập sai mật khẩu trả 401 và không tiết lộ email có tồn tại hay không', async () => {
    const wrong = await login(emailB, 'SaiMatKhau999'); const ghost = await login(`khong_co_${stamp}@demo.local`, 'SaiMatKhau999');
    assert.equal(wrong.status, 401); assert.equal(ghost.status, 401);
    assert.equal(wrong.json.error.message, ghost.json.error.message);
});
test('TC-15 Kích thước trang cực lớn bị máy chủ cắt về trần 50', async () => {
    const r = await http('GET', '/titles?size=1000000');
    assert.equal(r.status, 200); assert.ok(r.json.pagination.size <= 50); assert.ok(r.json.data.length <= 50);
});
test('TC-16 Mã số sai định dạng trả 422, mã không tồn tại trả 404', async () => {
    assert.equal((await http('GET', '/titles/abc')).status, 422);
    assert.equal((await http('GET', '/titles/99999999')).status, 404);
});

test('TC-17 Chưa đăng nhập gọi điểm cuối ghi bị 401 (BM5)', async () => {
    assert.equal((await http('PUT', `/titles/${S.title.id}/rating`, { body: { score: 3 } })).status, 401);
    assert.equal((await http('GET', '/me/watchlist')).status, 401);
});
test('TC-18 USER không tạo, sửa, ẩn tác phẩm và không xem nhật ký: 403 (BM5)', async () => {
    assert.equal((await http('POST', '/titles', { body: { kind: 'movie', title: 'x' }, cookie: S.cookieA })).status, 403);
    assert.equal((await http('DELETE', `/titles/${S.title.id}`, { cookie: S.cookieA })).status, 403);
    assert.equal((await http('GET', '/admin/system-logs', { cookie: S.cookieA })).status, 403);
    assert.equal((await http('GET', '/admin/users', { cookie: S.cookieA })).status, 403);
    assert.equal((await http('POST', '/genres', { body: { code: 'xx', name: 'xx' }, cookie: S.cookieA })).status, 403);
});
test('TC-19 Truy cập chéo (BM4): B không đọc, sửa, xóa bình luận của A', async () => {
    const mine = await http('GET', `/titles/${S.title.id}/reviews/mine`, { cookie: S.cookieB });
    assert.equal(mine.status, 404); // B chưa có bình luận; không thấy của A
    assert.equal((await http('POST', `/moderation/reviews/${S.reviewId}/moderate`, { body: { action: 'hide' }, cookie: S.cookieB })).status, 403);
    const own = await http('GET', `/titles/${S.title.id}/reviews/mine`, { cookie: S.cookieA });
    assert.equal(own.status, 200); assert.equal(own.json.data.id, S.reviewId);
});
test('TC-20 Tiêm nhiễm SQL trong tìm kiếm không gây lỗi 5xx và không lộ lỗi CSDL (BM1)', async () => {
    for (const p of ["' OR '1'='1", "');DROP TABLE users;--", "x' UNION SELECT email, password_hash FROM users -- "]) {
        const r = await http('GET', `/titles?keyword=${encodeURIComponent(p)}`);
        assert.ok(r.status < 500, `${p} -> ${r.status}`); assert.ok(!/sql|syntax|ER_|password_hash/i.test(r.text));
    }
    assert.equal((await http('GET', '/titles/1%20OR%201%3D1')).status, 422);
});
test('TC-21 Đăng nhập sai liên tiếp: 401 năm lần đầu, 429 từ lần thứ sáu, đúng mật khẩu vẫn 429 (BM10)', async () => {
    await http('POST', '/auth/register', { body: { email: emailLock, password: PW, fullName: 'Nguyen Khoa Test' } });
    const codes = []; for (let i = 0; i < 7; i += 1) codes.push((await login(emailLock, `Sai${i}Mat123`)).status);
    assert.deepEqual(codes.slice(0, 5), [401, 401, 401, 401, 401], codes.join(','));
    assert.deepEqual(codes.slice(5), [429, 429], codes.join(','));
    assert.equal((await login(emailLock, PW)).status, 429);
});
test('TC-22 Sau đăng xuất thẻ cũ bị thu hồi: 401 (BM7)', async () => {
    const t = await login(emailB, PW); assert.equal(t.status, 200);
    assert.equal((await http('POST', '/auth/logout', { cookie: t.cookie })).status, 200);
    const r = await http('GET', '/auth/me', { cookie: t.cookie });
    assert.equal(r.status, 401); assert.equal(code(r), 'TOKEN_REVOKED');
});
test('TC-23 Yêu cầu ghi mang cookie từ nguồn gốc lạ bị chặn 403 CSRF_BLOCKED (BM3)', async () => {
    const r = await http('PUT', `/titles/${S.title.id}/rating`, { body: { score: 1 }, cookie: S.cookieA, headers: { Origin: 'https://evil.example' } });
    assert.equal(r.status, 403); assert.equal(code(r), 'CSRF_BLOCKED');
});
test('TC-24 Phản hồi có đủ thẻ tiêu đề bảo mật và mã lỗi không lộ thông tin nội bộ (BM12, BM9)', async () => {
    const res = await fetch(BASE + '/');
    for (const h of ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'content-security-policy']) assert.ok(res.headers.get(h), h);
    const bad = await http('POST', '/auth/login', { raw: '{bad json', headers: { 'Content-Type': 'application/json' } });
    assert.equal(bad.status, 400); assert.ok(!/at .*\.js|node_modules|SELECT /i.test(bad.text));
    assert.ok(bad.json.error.requestId, 'thiếu requestId');
});

test('TC-25 Thống kê thể loại: MODERATOR 200 có dữ liệu, USER bị 403', { skip: needMod }, async () => {
    const ok = await http('GET', '/stats/genres', { cookie: S.mod }); assert.equal(ok.status, 200); assert.ok(Array.isArray(ok.json.data));
    assert.equal((await http('GET', '/stats/genres', { cookie: S.cookieA })).status, 403);
});
test('TC-26 Xuất CSV (ADMIN): có BOM UTF-8 và đọc lại được đúng cấu trúc; MODERATOR bị 403', { skip: needAdmin }, async () => {
    const a = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD); assert.equal(a.status, 200, a.text); S.admin = a.cookie;
    const r = await fetch(`${API}/stats/export?report=genres&format=csv`, { headers: { Cookie: S.admin } });
    assert.equal(r.status, 200); const text = await r.text(); assert.ok(text.startsWith('\uFEFF'));
    const rows = parseCsv(text); assert.ok(rows.length >= 2); assert.ok(rows.every((x) => x.length === rows[0].length));
    if (S.mod) assert.equal((await http('GET', '/stats/export?report=genres&format=csv', { cookie: S.mod })).status, 403);
});
test('TC-27 Đối soát bảng tổng hợp (ADMIN): không có tác phẩm nào lệch so với bảng ratings', { skip: needAdmin }, async () => {
    const r = await http('GET', '/admin/aggregates/reconcile', { cookie: S.admin });
    assert.equal(r.status, 200, r.text);
    const body = r.json.data || r.json; const mism = body.mismatches || body.mismatched || body.items || [];
    assert.equal(Array.isArray(mism) ? mism.length : 0, 0, JSON.stringify(body).slice(0, 300));
});
