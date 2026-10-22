#!/usr/bin/env node
'use strict';

const BASE = (process.argv.find((a, i) => i > 1 && a.startsWith('http')) || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const API = `${BASE}/api/v1`;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const PW = 'MatKhau12345';
const line = (n = 100, ch = '=') => ch.repeat(n);
const now = () => new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });

async function call(method, path, { body, cookie } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* không phải JSON */ }
    const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    return { status: res.status, json, cookie: (sc.find((c) => c.startsWith('accessToken=')) || '').split(';')[0] || null };
}
const login = async (e, p) => (await call('POST', '/auth/login', { body: { email: e, password: p } })).cookie;
const user = async (stamp, k) => {
    const email = `evidence_${stamp}_${k}@demo.local`;
    await call('POST', '/auth/register', { body: { email, password: PW, fullName: `Nguyen Evidence ${k}` } });
    return { email, cookie: await login(email, PW) };
};
const short = (r) => {
    if (!r.json) return '(không có nội dung JSON)';
    if (r.json.error) return `${r.json.error.code}: ${r.json.error.message}`;
    return JSON.stringify(r.json).slice(0, 150);
};
const show = (who, method, path, r) => console.log(`  [${who}] ${method} /api/v1${path}\n      -> HTTP ${r.status}  ${short(r)}`);
const head = (title) => { console.log(`\n${line()}\n${title}\n${line()}`); };

(async () => {
    console.log(`BẰNG CHỨNG KIỂM THỬ | Máy chủ: ${BASE} | Thời điểm: ${now()} (giờ Việt Nam)`);
    if (!DEMO_PASSWORD) { console.log('Cần đặt biến DEMO_PASSWORD (mật khẩu demo của mod01 và admin01).'); process.exit(1); }
    const stamp = Date.now();
    const A = await user(stamp, 'A'); const B = await user(stamp, 'B');
    const mod = await login('mod01@demo.local', DEMO_PASSWORD); const admin = await login('admin01@demo.local', DEMO_PASSWORD);
    if (!A.cookie || !B.cookie || !mod || !admin) { console.error('Không đăng nhập được các tài khoản thử (kiểm tra DEMO_PASSWORD).'); process.exit(1); }
    let failed = 0;

    // ---------------------------------------------------------------- IDOR
    if (!ONLY || ONLY === 'idor') {
        head('BM4 - THAM CHIẾU ĐỐI TƯỢNG TRỰC TIẾP KHÔNG AN TOÀN (IDOR): người dùng B thao tác lên tài nguyên của A');
        console.log(`  A = ${A.email} (USER)   B = ${B.email} (USER)\n`);
        const pop = await call('GET', '/titles?sort=popular&page=5&size=12');
        const T = pop.json.data[0].id; const T2 = pop.json.data[1].id;
        await call('PUT', `/titles/${T}/rating`, { body: { score: 4 }, cookie: A.cookie });
        const rv = await call('POST', `/titles/${T}/reviews`, { body: { body: `Bình luận để minh chứng IDOR ${stamp}` }, cookie: A.cookie });
        const appr = await call('POST', `/moderation/reviews/${rv.json.data.id}/moderate`, { body: { action: 'approve' }, cookie: mod });
        const notes = await call('GET', '/me/notifications', { cookie: A.cookie });
        const nid = notes.json.data[0].id;
        console.log(`  Chuẩn bị: A chấm điểm, bình luận; người kiểm duyệt duyệt (HTTP ${appr.status}); A nhận thông báo id ${nid}.\n`);

        console.log('  1) Thông báo của A (id ' + nid + ')');
        let r = await call('POST', `/me/notifications/${nid}/read`, { cookie: B.cookie }); show('B', 'POST', `/me/notifications/${nid}/read`, r);
        if (r.status !== 404) failed++;
        r = await call('GET', '/me/notifications', { cookie: B.cookie });
        console.log(`  [B] GET /api/v1/me/notifications\n      -> HTTP ${r.status}  B chỉ thấy ${r.json.data.length} thông báo của chính mình (không có id ${nid}): ${r.json.data.some((n) => n.id === nid) ? 'LỖI' : 'ĐẠT'}`);
        if (r.json.data.some((n) => n.id === nid)) failed++;
        r = await call('POST', `/me/notifications/${nid}/read`, { cookie: A.cookie }); show('A', 'POST', `/me/notifications/${nid}/read`, r);
        if (r.status !== 200) failed++;

        console.log('\n  2) Watchlist của A');
        await call('PUT', `/me/watchlist/${T2}`, { body: { listType: 'want' }, cookie: A.cookie });
        r = await call('DELETE', `/me/watchlist/${T2}`, { cookie: B.cookie }); show('B', 'DELETE', `/me/watchlist/${T2}`, r);
        if (r.status !== 404) failed++;
        r = await call('GET', '/me/watchlist', { cookie: A.cookie });
        const still = r.json.data.some((x) => x.titleId === T2);
        console.log(`  [A] GET /api/v1/me/watchlist\n      -> HTTP ${r.status}  mục của A vẫn còn nguyên sau yêu cầu của B: ${still ? 'ĐẠT' : 'LỖI'}`);
        if (!still) failed++;

        console.log('\n  3) Bình luận của A');
        r = await call('PUT', `/titles/${T}/reviews/mine`, { body: { body: 'B cố sửa bình luận của A bằng cách gọi cùng đường dẫn' }, cookie: B.cookie }); show('B', 'PUT', `/titles/${T}/reviews/mine`, r);
        if (r.status !== 404) failed++;
        r = await call('GET', `/titles/${T}/reviews/mine`, { cookie: B.cookie }); show('B', 'GET', `/titles/${T}/reviews/mine`, r);
        if (r.status !== 404) failed++;
        r = await call('GET', `/titles/${T}/reviews/mine`, { cookie: A.cookie });
        console.log(`  [A] GET /api/v1/titles/${T}/reviews/mine\n      -> HTTP ${r.status}  nội dung của A không đổi: ${r.json && r.json.data && r.json.data.body.startsWith('Bình luận để minh chứng') ? 'ĐẠT' : 'LỖI'}`);
        console.log('\n  Kết luận: mọi đường dẫn đều lấy mã người dùng từ token; không có mã người dùng nào nhận từ máy khách, nên B không truy cập chéo được.');
        // dọn
        await call('DELETE', `/titles/${T}/reviews/mine`, { cookie: A.cookie }); await call('DELETE', `/titles/${T}/rating`, { cookie: A.cookie }); await call('DELETE', `/me/watchlist/${T2}`, { cookie: A.cookie });
    }

    // ---------------------------------------------------------------- ma trận
    if (!ONLY || ONLY === 'matrix') {
        head('BM5 - PHÁ VỠ KIỂM SOÁT TRUY CẬP: MA TRẬN PHÂN QUYỀN THỰC TẾ (gọi trực tiếp điểm cuối, không qua giao diện)');
        console.log('  Ký hiệu: K = Khách (không cookie), U = USER, M = MODERATOR, A = ADMIN. Ô hiển thị mã HTTP thực tế; dấu * là lệch so với kỳ vọng.');
        console.log('  401 = chưa đăng nhập, 403 = không đủ quyền, 422/404 = QUA cửa phân quyền và bị từ chối ở bước kiểm tra dữ liệu (không thay đổi dữ liệu).\n');
        const C = [
            ['POST /titles (tạo tác phẩm)', 'POST', '/titles', {}, [401, 403, 422, 422]],
            ['DELETE /titles/:id (ẩn tác phẩm)', 'DELETE', '/titles/99999999', undefined, [401, 403, 403, 404]],
            ['PUT /titles/:id/rating (chấm điểm)', 'PUT', '/titles/99999999/rating', { score: 9 }, [401, 422, 403, 422]],
            ['POST /titles/:id/reviews (bình luận)', 'POST', '/titles/99999999/reviews', { body: 'x' }, [401, 422, 403, 422]],
            ['PUT /reviews/:id/vote (bình chọn)', 'PUT', '/reviews/1/vote', { vote: 2 }, [401, 422, 403, 422]],
            ['POST /reviews/:id/reports (báo cáo)', 'POST', '/reviews/1/reports', { reason: 'khong' }, [401, 422, 403, 422]],
            ['PUT /me/watchlist/:id (theo dõi)', 'PUT', '/me/watchlist/99999999', { listType: 'khong' }, [401, 422, 403, 422]],
            ['GET /moderation/reviews (hàng đợi)', 'GET', '/moderation/reviews', undefined, [401, 403, 200, 200]],
            ['POST /moderation/reviews/:id/moderate', 'POST', '/moderation/reviews/1/moderate', { action: 'khong' }, [401, 403, 422, 422]],
            ['GET /admin/system-logs (nhật ký)', 'GET', '/admin/system-logs?size=1', undefined, [401, 403, 403, 200]],
            ['GET /admin/aggregates/reconcile', 'GET', '/admin/aggregates/reconcile', undefined, [401, 403, 403, 200]]
        ];
        const who = [null, A.cookie, mod, admin];
        console.log(`  ${'Điểm cuối'.padEnd(42)} ${'K'.padEnd(6)}${'U'.padEnd(6)}${'M'.padEnd(6)}${'A'.padEnd(6)} Kết quả`);
        console.log('  ' + line(78, '-'));
        for (const [label, method, path, body, expected] of C) {
            const got = [];
            for (const ck of who) got.push((await call(method, path, { body, cookie: ck || undefined })).status);
            const bad = got.some((g, i) => g !== expected[i]);
            if (bad) failed++;
            console.log(`  ${label.padEnd(42)} ${got.map((g, i) => (String(g) + (g !== expected[i] ? '*' : '')).padEnd(6)).join('')}${bad ? 'LỖI' : 'ĐẠT'}`);
        }
        console.log('\n  Quy tắc: quyền kiểm tra ở máy chủ theo bảng role_permissions. MODERATOR không chấm điểm, bình luận, bình chọn, báo cáo, theo dõi (403);');
        console.log('  USER không vào khu kiểm duyệt hay quản trị (403); chỉ ADMIN xem nhật ký và đối soát; khách luôn nhận 401.');
    }

    // ---------------------------------------------------------------- nhật ký
    if (!ONLY || ONLY === 'logs') {
        head('K8 - NHẬT KÝ HỆ THỐNG: GET /api/v1/admin/system-logs?size=20');
        let r = await call('GET', '/admin/system-logs?size=20'); show('Khách', 'GET', '/admin/system-logs?size=20', r); if (r.status !== 401) failed++;
        r = await call('GET', '/admin/system-logs?size=20', { cookie: A.cookie }); show('USER', 'GET', '/admin/system-logs?size=20', r); if (r.status !== 403) failed++;
        r = await call('GET', '/admin/system-logs?size=20', { cookie: admin });
        console.log(`  [ADMIN] GET /api/v1/admin/system-logs?size=20\n      -> HTTP ${r.status}  tổng ${r.json.pagination.total} bản ghi, trang ${r.json.pagination.page}/${r.json.pagination.totalPages}\n`);
        if (r.status !== 200) failed++;
        console.log(`  ${'ID'.padEnd(6)}${'Thời điểm (UTC)'.padEnd(21)}${'Hành động'.padEnd(20)}${'Đối tượng'.padEnd(13)}${'ID đt'.padEnd(7)}${'Người thực hiện'.padEnd(26)}IP`);
        console.log('  ' + line(98, '-'));
        r.json.data.forEach((x) => console.log(`  ${String(x.id).padEnd(6)}${String(x.createdAt).padEnd(21)}${x.action.padEnd(20)}${String(x.entity).padEnd(13)}${String(x.entityId ?? '').padEnd(7)}${String(x.userName || '(khách/hệ thống)').slice(0, 24).padEnd(26)}${x.ip || ''}`));
    }

    // ---------------------------------------------------------------- bộ lọc nhật ký
    if (!ONLY || ONLY === 'logfilter') {
        head('K8 - NHẬT KÝ HỆ THỐNG: BỘ LỌC (action, entity, userId, khoảng thời gian)');
        const today = new Date().toISOString().slice(0, 10);
        const me = await call('GET', '/auth/me', { cookie: admin });
        const cases = [
            ['action=LOGIN_FAILED', (x) => x.action === 'LOGIN_FAILED', 'mọi dòng có action = LOGIN_FAILED'],
            ['entity=reviews', (x) => x.entity === 'reviews', 'mọi dòng có entity = reviews'],
            [`userId=${me.json.data.id}`, (x) => x.userId === me.json.data.id, `mọi dòng do người dùng ${me.json.data.id} (admin01) thực hiện`],
            [`from=${today}&to=${today}`, (x) => x.createdAt >= `${today} 00:00:00` && x.createdAt <= `${today} 23:59:59`, `mọi dòng nằm trong ngày ${today} (UTC)`],
            ['action=LOGIN_SUCCESS&entity=users&from=2020-01-01', (x) => x.action === 'LOGIN_SUCCESS' && x.entity === 'users', 'kết hợp action + entity + từ ngày']
        ];
        for (const [qs, test, what] of cases) {
            const r = await call('GET', `/admin/system-logs?${qs}&size=100`, { cookie: admin });
            const rows = (r.json && r.json.data) || [];
            const good = r.status === 200 && rows.length > 0 && rows.every(test);
            if (!good) failed++;
            console.log(`\n  [ADMIN] GET /api/v1/admin/system-logs?${qs}\n      -> HTTP ${r.status}  tổng ${r.json && r.json.pagination ? r.json.pagination.total : '?'} bản ghi; ${what}: ${good ? 'ĐẠT' : 'LỖI'}`);
            rows.slice(0, 4).forEach((x) => console.log(`         ${String(x.id).padEnd(6)}${String(x.createdAt).padEnd(21)}${x.action.padEnd(18)}${String(x.entity).padEnd(10)}${String(x.userName || '(khách)').slice(0, 22).padEnd(24)}${x.ip || ''}`));
        }
        console.log('\n  Bộ lọc sai bị từ chối (không để lọt vào câu SQL):');
        for (const [qs, label] of [['from=2026-02-31', 'ngày không có thật'], ["action=x'%3B%20DROP%20TABLE", 'action chứa SQL'], ['from=2026-10-12&to=2026-10-01', 'from sau to'], ['userId=-1', 'userId âm']]) {
            const r = await call('GET', `/admin/system-logs?${qs}`, { cookie: admin });
            if (r.status !== 422) failed++;
            console.log(`  [ADMIN] ?${qs.padEnd(34)} -> HTTP ${r.status}  (${label}) ${r.status === 422 ? 'ĐẠT' : 'LỖI'}`);
        }
    }

    console.log(`\n${line()}\nTổng kết: ${failed === 0 ? 'TẤT CẢ ĐẠT' : failed + ' mục lỗi'} | ${BASE} | ${now()}`);
    console.log("Dọn tài khoản thử (tùy chọn): DELETE FROM users WHERE email LIKE 'evidence\\_%';");
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Không chạy được:', e.message); process.exit(1); });
