#!/usr/bin/env node
'use strict';
const BASE = (process.argv.find((a, i) => i > 1 && a.startsWith('http')) || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const API = `${BASE}/api/v1`;
const PW = 'MatKhau12345';
const now = () => new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
const head = (t) => console.log(`\n${'='.repeat(100)}\n${t}\n${'='.repeat(100)}`);
const run = (k) => !ONLY || ONLY === k;

async function call(method, path, { body, cookie, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (body !== undefined && !raw) h['Content-Type'] = 'application/json';
    if (cookie) h.Cookie = cookie;
    const res = await fetch(API + path, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (e) { /* không phải JSON */ }
    const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    return { status: res.status, json, text, headers: res.headers, setCookie };
}
const brief = (r) => r.json && r.json.error ? `${r.json.error.code}: ${r.json.error.message}` : (r.json ? JSON.stringify(r.json).slice(0, 140) : r.text.slice(0, 140));
const show = (label, r) => console.log(`  ${label}\n      -> HTTP ${r.status}  ${brief(r)}`);
let failed = 0;
const expect = (ok, msg) => { console.log(`      ${ok ? 'ĐẠT ' : 'KHÔNG ĐẠT'}: ${msg}`); if (!ok) failed++; };

(async () => {
    console.log(`BẰNG CHỨNG BẢO MẬT | Máy chủ: ${BASE} | Thời điểm: ${now()} (giờ Việt Nam)`);
    const stamp = Date.now();
    const email = `bm_${stamp}@demo.local`;
    await call('POST', '/auth/register', { body: { email, password: PW, fullName: 'Nguyen Bao Mat' } });
    const lg = await call('POST', '/auth/login', { body: { email, password: PW } });
    const cookie = (lg.setCookie.find((c) => c.startsWith('accessToken=')) || '').split(';')[0];

    if (run('bm1')) {
        head('BM1 - TIÊM NHIỄM SQL: chuỗi tấn công vào tham số tìm kiếm và tham số đường dẫn');
        for (const p of ["' OR '1'='1", "');DROP TABLE users;--", "1 UNION SELECT password_hash FROM users"]) {
            const r = await call('GET', `/titles?keyword=${encodeURIComponent(p)}`);
            show(`GET /titles?keyword=${p}`, r);
            expect(r.status === 200 || r.status === 400 || r.status === 422, 'không có 500, không lộ lỗi CSDL');
            expect(!/sql|syntax|ER_/i.test(r.text), 'phản hồi không chứa chữ SQL/ER_');
        }
        const r = await call('GET', `/titles/${encodeURIComponent("1 OR 1=1")}`);
        show('GET /titles/1 OR 1=1', r);
        expect(r.status === 400 || r.status === 404 || r.status === 422, 'tham số đường dẫn bị từ chối');
        const users = await call('GET', '/titles?keyword=a');
        expect(users.status === 200, 'bảng users còn nguyên (hệ thống vẫn phục vụ)');
    }

    if (run('bm2')) {
        head('BM2 - XSS: dữ liệu độc được lưu nguyên văn dạng JSON; giao diện hiển thị bằng textContent (xem public/app.js)');
        const t = await call('GET', '/titles?size=1');
        const id = t.json && t.json.data && (t.json.data.items || t.json.data)[0] && (t.json.data.items || t.json.data)[0].id;
        if (id && cookie) {
            const payload = '<img src=x onerror=alert(1)> <script>alert(1)</script> bình luận thử XSS';
            const w = await call('POST', `/titles/${id}/reviews`, { body: { body: payload }, cookie, headers: { Origin: BASE } });
            show(`POST /titles/${id}/reviews (nội dung chứa thẻ script)`, w);
            const mine = await call('GET', `/titles/${id}/reviews/mine`, { cookie });
            console.log(`      Content-Type phản hồi: ${mine.headers.get('content-type')} | X-Content-Type-Options: ${mine.headers.get('x-content-type-options')}`);
            expect((mine.headers.get('content-type') || '').includes('application/json'), 'trả JSON, trình duyệt không diễn giải thành HTML');
            console.log('      Mở trang chi tiết tác phẩm trong trình duyệt: chuỗi phải hiện nguyên dạng văn bản, không bật hộp thoại alert.');
        } else console.log('  (không có tác phẩm hoặc chưa đăng nhập được: bỏ qua)');
        const csp = (await fetch(BASE + '/')).headers.get('content-security-policy');
        console.log(`  Content-Security-Policy: ${csp}`);
        expect(Boolean(csp) && /script-src 'self'/.test(csp) && !/unsafe-inline.*script|script-src[^;]*unsafe-inline/.test(csp), 'CSP chặn script nội tuyến');
    }

    if (run('bm3')) {
        head('BM3 - CSRF: yêu cầu thay đổi trạng thái từ trang ngoài (Origin lạ) kèm cookie phiên');
        const bad = await call('POST', '/auth/logout', { cookie, headers: { Origin: 'https://trang-doc-hai.example' } });
        show('POST /auth/logout   Origin: https://trang-doc-hai.example', bad);
        expect(bad.status === 403 && bad.json && bad.json.error.code === 'CSRF_BLOCKED', 'bị từ chối 403 CSRF_BLOCKED');
        const form = await call('POST', '/auth/logout', { cookie, headers: { Origin: BASE, 'Content-Type': 'text/plain' }, raw: 'x=1' });
        show('POST /auth/logout   Content-Type: text/plain (biểu mẫu chéo trang)', form);
        expect(form.status === 403, 'kiểu nội dung không phải JSON bị từ chối');
        console.log('  Cookie phiên đặt SameSite=Strict (xem BM7).');
    }

    if (run('bm7')) {
        head('BM7 - QUẢN LÝ PHIÊN: thuộc tính cookie và thu hồi phiên khi đăng xuất');
        const sc = lg.setCookie.find((c) => c.startsWith('accessToken='));
        console.log(`  Set-Cookie: ${sc ? sc.replace(/accessToken=[^;]+/, 'accessToken=<đã che>') : '(không có)'}`);
        expect(/HttpOnly/i.test(sc || ''), 'HttpOnly'); expect(/SameSite=Strict/i.test(sc || ''), 'SameSite=Strict');
        expect(BASE.startsWith('http://localhost') || /Secure/i.test(sc || ''), 'Secure (trên HTTPS)');
        expect(/Max-Age|Expires/i.test(sc || ''), 'có thời hạn');
        const out = await call('POST', '/auth/logout', { cookie, headers: { Origin: BASE } });
        show('POST /auth/logout', out);
        const reuse = await call('GET', '/auth/me', { cookie });
        show('GET /auth/me dùng lại cookie cũ sau đăng xuất', reuse);
        expect(reuse.status === 401, 'token cũ bị thu hồi (TOKEN_REVOKED)');
    }

    if (run('bm8')) {
        head('BM8 - TẢI TỆP: tệp .php đổi tên .jpg phải bị từ chối (cần tài khoản MODERATOR/ADMIN: đặt MOD_EMAIL, MOD_PASSWORD)');
        if (!process.env.MOD_EMAIL || !process.env.MOD_PASSWORD) { console.log('  (bỏ qua: thiếu MOD_EMAIL/MOD_PASSWORD)'); }
        else {
            const l2 = await call('POST', '/auth/login', { body: { email: process.env.MOD_EMAIL, password: process.env.MOD_PASSWORD } });
            const ck = (l2.setCookie.find((c) => c.startsWith('accessToken=')) || '').split(';')[0];
            const t = await call('GET', '/titles?size=1', { cookie: ck });
            const id = (t.json.data.items || t.json.data)[0].id;
            const send = async (name, type, bytes) => {
                const fd = new FormData(); fd.append('file', new Blob([bytes], { type }), name);
                const res = await fetch(`${API}/files/titles/${id}/poster`, { method: 'POST', headers: { Cookie: ck, Origin: BASE }, body: fd });
                return { status: res.status, json: await res.json().catch(() => null), text: '' };
            };
            const fake = await send('anh.jpg', 'image/jpeg', Buffer.from('<?php system($_GET["c"]); ?>'));
            show('POST poster: shell.php đổi tên anh.jpg, Content-Type: image/jpeg', fake);
            expect(fake.status === 415, 'bị từ chối 415 INVALID_FILE_SIGNATURE');
            const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
            const ok = await send('that.png', 'image/png', png);
            show('POST poster: PNG thật', ok);
            expect(ok.status === 201, 'ảnh thật được chấp nhận');
            if (ok.json && ok.json.data) {
                const g = await fetch(BASE + ok.json.data.url);
                console.log(`      GET ${ok.json.data.url} -> ${g.status} Content-Type: ${g.headers.get('content-type')} nosniff: ${g.headers.get('x-content-type-options')}`);
            }
        }
    }

    if (run('bm9')) {
        head('BM9 - RÒ RỈ THÔNG TIN QUA LỖI: dữ liệu gây lỗi không được lộ SQL, đường dẫn tệp, vết gọi hàm');
        const cases = [['GET', '/titles/abc'], ['POST', '/auth/login', { raw: '{bad json', headers: { 'Content-Type': 'application/json' } }], ['GET', '/khong-ton-tai']];
        for (const [m, p, o] of cases) {
            const r = await call(m, p, o || {});
            show(`${m} ${p}`, r);
            expect(!/at .*\.js|node_modules|\/src\/|ER_|SELECT |stack/i.test(r.text), 'không chứa vết gọi hàm / đường dẫn / SQL');
        }
    }

    if (run('bm10')) {
        head('BM10 - DÒ MẬT KHẨU: 8 lần đăng nhập sai liên tiếp vào CÙNG một tài khoản; lần 6 trở đi phải là 429');
        const victim = `lock_${stamp}@demo.local`;
        await call('POST', '/auth/register', { body: { email: victim, password: PW, fullName: 'Nguyen Khoa' } });
        const codes = [];
        for (let i = 1; i <= 8; i++) { const r = await call('POST', '/auth/login', { body: { email: victim, password: 'sai-mat-khau-' + i } }); codes.push(r.status); console.log(`  lần ${i}: HTTP ${r.status}  ${brief(r)}`); }
        expect(codes.slice(0, 5).every((c) => c === 401) && codes.slice(5).every((c) => c === 429), '401 từ lần 1-5, 429 từ lần 6');
        const good = await call('POST', '/auth/login', { body: { email: victim, password: PW } });
        show('Đăng nhập ĐÚNG mật khẩu khi đang bị khóa tạm', good);
        expect(good.status === 429, 'vẫn bị từ chối trong thời gian khóa');
        console.log('  Nhật ký: vào /api/v1/admin/system-logs?action=ACCOUNT_LOCKED bằng tài khoản ADMIN để chụp bản ghi tương ứng.');
    }

    if (run('bm12')) {
        head('BM12 - THẺ TIÊU ĐỀ BẢO MẬT & HTTPS (tương đương: curl -I ' + BASE + '/)');
        const res = await fetch(BASE + '/');
        for (const h of ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'content-security-policy', 'permissions-policy']) {
            const v = res.headers.get(h); console.log(`  ${h}: ${v}`); expect(Boolean(v), h);
        }
        if (BASE.startsWith('http://') && !BASE.includes('localhost')) console.log('  CẢNH BÁO: địa chỉ không phải HTTPS.');
    }

    console.log(`\nTỔNG KẾT: ${failed === 0 ? 'TẤT CẢ ĐẠT' : failed + ' mục KHÔNG ĐẠT'}`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Lỗi chạy script:', e.message); process.exit(1); });
