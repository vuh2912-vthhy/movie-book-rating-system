#!/usr/bin/env node
'use strict';
/**
 * Kiểm thử khói Ngày 2: danh mục, tìm kiếm, xếp hạng, chấm điểm, đồng thời, quản trị nội dung.
 *   node scripts/smoke-titles.js                          -> http://localhost:3000
 *   node scripts/smoke-titles.js https://ten-mien.app     -> trực tuyến
 * Để kiểm thử phần nhân viên (MODERATOR/ADMIN) đặt mật khẩu demo đã dùng khi sinh seed:
 *   $env:DEMO_PASSWORD='mat-khau-demo'; node scripts/smoke-titles.js
 * Tùy chọn: LOAD_USERS=30 (số người chấm điểm đồng thời, mặc định 30).
 * Mỗi lần chạy tạo thêm tài khoản load_*@demo.local và vài tác phẩm thử (được ẩn ở cuối).
 * Cần Node 18 trở lên. Chụp ảnh màn hình kết quả làm bằng chứng cho Buổi 05, 06 và 07.
 */
const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const API = `${BASE}/api/v1`;
const LOAD = Math.max(5, parseInt(process.env.LOAD_USERS || '30', 10));
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
    if (ok) passed += 1; else failed += 1;
    console.log(`${ok ? '  ĐẠT ' : '  LỖI '} ${name}${ok ? '' : `  -> ${detail}`}`);
};
const section = (title) => console.log(`\n${title}`);

async function call(method, path, { body, cookie } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* không phải JSON */ }
    const setCookies = typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
    return { status: res.status, json, setCookies };
}
const code = (r) => (r.json && r.json.error ? r.json.error.code : undefined);
const cookieOf = (r) => {
    const c = r.setCookies.find((x) => x.startsWith('accessToken='));
    return c ? c.split(';')[0] : null;
};
const login = async (email, password) => cookieOf(await call('POST', '/auth/login', { body: { email, password } }));
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

(async () => {
    console.log(`\nKiểm thử khói Ngày 2 tại ${API}  (tải đồng thời: ${LOAD} người)`);

    // ------------------------------------------------------------------
    section('1. Danh mục công khai (khách, không cần đăng nhập)');
    let r = await call('GET', '/genres');
    const genres = (r.json && r.json.data) || [];
    check('GET /genres trả 200, có đủ thể loại', r.status === 200 && genres.length >= 10, `status ${r.status}`);
    const genreId = (c) => (genres.find((g) => g.code === c) || {}).id;

    r = await call('GET', '/titles');
    const list = (r.json && r.json.data) || [];
    check('GET /titles trả 200, có phân trang', r.status === 200 && list.length > 0 && r.json.pagination && r.json.pagination.total > 0, `status ${r.status}`);
    check('Mỗi trang mặc định 12 mục', list.length === 12 && r.json.pagination.size === 12, `size ${list.length}`);
    check('Xếp hạng có xét độ tin cậy: tác phẩm đầu bảng có từ 25 lượt chấm trở lên',
        list.length > 0 && list[0].stats.ratingCount >= 25, `ratingCount ${list[0] && list[0].stats.ratingCount}`);
    check('Khách không thấy trường status', list.length > 0 && !('status' in list[0]));

    r = await call('GET', '/titles?page=0');
    check('page=0 trả 422 (trước đây gây lỗi 500)', r.status === 422 && code(r) === 'VALIDATION_FAILED', `status ${r.status}`);
    r = await call('GET', '/titles?size=abc');
    check('size=abc trả 422', r.status === 422, `status ${r.status}`);
    r = await call('GET', '/titles?sort=password');
    check('sort ngoài danh sách cho phép trả 422', r.status === 422, `status ${r.status}`);
    r = await call('GET', '/titles?kind=song');
    check('kind không hợp lệ trả 422', r.status === 422, `status ${r.status}`);
    r = await call('GET', '/titles?size=500');
    check('size=500 bị cắt về trần 50', r.status === 200 && r.json.pagination.size === 50, `size ${r.json && r.json.pagination && r.json.pagination.size}`);
    r = await call('GET', '/titles?kind=book&size=50');
    check('Lọc kind=book chỉ trả sách', r.status === 200 && r.json.data.length > 0 && r.json.data.every((t) => t.kind === 'book'));
    r = await call('GET', '/titles?genre=drama&size=50');
    check('Lọc theo thể loại drama', r.status === 200 && r.json.data.length > 0 && r.json.data.every((t) => t.genres.some((g) => g.code === 'drama')));

    const noAccent = await call('GET', `/titles?keyword=${encodeURIComponent('ky uc')}`);
    const accent = await call('GET', `/titles?keyword=${encodeURIComponent('Ký ức')}`);
    check('Tìm "ky uc" và "Ký ức" cho cùng kết quả (không dấu = có dấu)',
        noAccent.status === 200 && noAccent.json.pagination.total > 0 && noAccent.json.pagination.total === accent.json.pagination.total,
        `${noAccent.json && noAccent.json.pagination.total} vs ${accent.json && accent.json.pagination.total}`);
    r = await call('GET', `/titles?keyword=${encodeURIComponent("' OR 1=1 --")}`);
    check("Từ khóa kiểu SQL injection không gây lỗi và không trả dữ liệu (BM1)", r.status === 200 && r.json.pagination.total === 0, `status ${r.status}`);
    r = await call('GET', `/titles?keyword=${encodeURIComponent('%')}`);
    check('Ký tự % trong từ khóa được hiểu theo nghĩa đen, không khớp mọi dòng', r.status === 200 && r.json.pagination.total === 0, `total ${r.json && r.json.pagination.total}`);

    const first = list[0];
    r = await call('GET', `/titles/${first.id}`);
    check('GET /titles/:id trả 200 kèm thể loại, vai trò, thống kê',
        r.status === 200 && r.json.data.genres.length > 0 && r.json.data.credits.length > 0 && r.json.data.stats, `status ${r.status}`);
    r = await call('GET', '/titles/abc');
    check('Mã không phải số trả 422', r.status === 422, `status ${r.status}`);
    r = await call('GET', '/titles/99999999');
    check('Mã không tồn tại trả 404 TITLE_NOT_FOUND', r.status === 404 && code(r) === 'TITLE_NOT_FOUND', `status ${r.status}`);

    // ------------------------------------------------------------------
    section('2. Phân quyền ở máy chủ (BM5)');
    r = await call('POST', '/titles', { body: {} });
    check('Khách tạo tác phẩm trả 401', r.status === 401, `status ${r.status}`);
    r = await call('PUT', `/titles/${first.id}/rating`, { body: { score: 4 } });
    check('Khách chấm điểm trả 401', r.status === 401, `status ${r.status}`);

    const stamp = Date.now();
    const mainEmail = `smoke_${stamp}@demo.local`;
    const password = 'MatKhau12345';
    await call('POST', '/auth/register', { body: { email: mainEmail, password, fullName: 'Nguyen Smoke' } });
    const userCookie = await login(mainEmail, password);
    check('Người dùng thường đăng ký và đăng nhập được', Boolean(userCookie));
    r = await call('POST', '/titles', { body: {}, cookie: userCookie });
    check('USER tạo tác phẩm trả 403', r.status === 403 && code(r) === 'FORBIDDEN', `status ${r.status}`);
    r = await call('DELETE', `/titles/${first.id}`, { cookie: userCookie });
    check('USER xóa tác phẩm trả 403', r.status === 403, `status ${r.status}`);
    r = await call('GET', '/admin/aggregates/reconcile', { cookie: userCookie });
    check('USER gọi API đối soát tổng hợp trả 403', r.status === 403, `status ${r.status}`);

    // ------------------------------------------------------------------
    section('3. Chấm điểm: một người dùng');
    const pop = await call('GET', '/titles?sort=popular&page=3&size=12');
    const target = pop.json.data[0];
    const detail = async (cookie) => (await call('GET', `/titles/${target.id}`, { cookie })).json.data;
    const base = await detail();
    r = await call('PUT', `/titles/${target.id}/rating`, { body: { score: 6 }, cookie: userCookie });
    check('Điểm 6 (ngoài 1 đến 5) trả 422', r.status === 422 && code(r) === 'VALIDATION_FAILED', `status ${r.status}`);
    r = await call('PUT', `/titles/${target.id}/rating`, { body: { score: '4' }, cookie: userCookie });
    check('Điểm kiểu chuỗi "4" trả 422', r.status === 422, `status ${r.status}`);
    r = await call('PUT', `/titles/${target.id}/rating`, { body: { score: 4 }, cookie: userCookie });
    check('Chấm lần đầu trả 201', r.status === 201, `status ${r.status} ${JSON.stringify(r.json)}`);
    check('Số lượt chấm tăng đúng 1', r.status === 201 && r.json.data.stats.ratingCount === base.stats.ratingCount + 1);
    r = await call('PUT', `/titles/${target.id}/rating`, { body: { score: 2 }, cookie: userCookie });
    check('Chấm lại trả 200 (cập nhật, không tạo bản ghi mới)', r.status === 200 && r.json.data.previousScore === 4, `status ${r.status}`);
    check('Chấm lại KHÔNG làm tăng số lượt chấm', r.status === 200 && r.json.data.stats.ratingCount === base.stats.ratingCount + 1);
    r = await call('GET', `/titles/${target.id}/rating`, { cookie: userCookie });
    check('GET điểm của tôi trả 2', r.status === 200 && r.json.data.score === 2);
    const mine = await detail(userCookie);
    check('Chi tiết tác phẩm trả myRating = 2 cho người đã đăng nhập', mine.myRating === 2);
    r = await call('DELETE', `/titles/${target.id}/rating`, { cookie: userCookie });
    check('Xóa điểm trả 200 và số lượt chấm về ban đầu', r.status === 200 && r.json.data.stats.ratingCount === base.stats.ratingCount, `status ${r.status}`);
    r = await call('DELETE', `/titles/${target.id}/rating`, { cookie: userCookie });
    check('Xóa lần nữa trả 404 RATING_NOT_FOUND', r.status === 404 && code(r) === 'RATING_NOT_FOUND', `status ${r.status}`);

    // ------------------------------------------------------------------
    section(`4. Đồng thời: ${LOAD} người chấm cùng một tác phẩm cùng lúc (Buổi 06)`);
    const emails = Array.from({ length: LOAD }, (_, i) => `load_${stamp}_${i}@demo.local`);
    const cookies = [];
    for (const group of chunks(emails, 10)) {
        const got = await Promise.all(group.map(async (email) => {
            await call('POST', '/auth/register', { body: { email, password, fullName: 'Nguyen Load' } });
            return login(email, password);
        }));
        cookies.push(...got);
    }
    check(`Tạo và đăng nhập ${LOAD} tài khoản thử`, cookies.filter(Boolean).length === LOAD, `${cookies.filter(Boolean).length}/${LOAD}`);

    const before = await detail();
    const scores = cookies.map((_, i) => (i % 5) + 1);
    const t0 = Date.now();
    const results = await Promise.all(cookies.map((c, i) => call('PUT', `/titles/${target.id}/rating`, { body: { score: scores[i] }, cookie: c })));
    const ms = Date.now() - t0;
    const created = results.filter((x) => x.status === 201).length;
    check(`${LOAD} yêu cầu song song: tất cả trả 201`, created === LOAD, `thành công ${created}/${LOAD}, mã: ${[...new Set(results.map((x) => x.status))].join(',')}`);
    const after = await detail();
    check('Số lượt chấm tăng đúng bằng số người chấm (không mất cập nhật)',
        after.stats.ratingCount === before.stats.ratingCount + LOAD, `${before.stats.ratingCount} -> ${after.stats.ratingCount}`);
    const expectedAvg = (before.stats.ratingAvg * before.stats.ratingCount + scores.reduce((a, b) => a + b, 0)) / (before.stats.ratingCount + LOAD);
    check('Điểm trung bình khớp giá trị tính tay (sai số nhỏ hơn 0,02)',
        Math.abs(after.stats.ratingAvg - expectedAvg) < 0.02, `${after.stats.ratingAvg} vs ${expectedAvg.toFixed(3)}`);
    console.log(`        (xử lý ${LOAD} yêu cầu trong ${ms} ms)`);
    const dup = await Promise.all([1, 2, 3, 4, 5].map((s) => call('PUT', `/titles/${target.id}/rating`, { body: { score: s }, cookie: cookies[0] })));
    check('5 yêu cầu song song của CÙNG một người không tạo thêm lượt chấm',
        dup.every((x) => x.status === 200 || x.status === 201) && (await detail()).stats.ratingCount === before.stats.ratingCount + LOAD);
    await Promise.all(cookies.map((c) => call('DELETE', `/titles/${target.id}/rating`, { cookie: c })));
    const restored = await detail();
    check('Cả nhóm xóa đồng thời: số lượt chấm về đúng ban đầu', restored.stats.ratingCount === before.stats.ratingCount, `${restored.stats.ratingCount} vs ${before.stats.ratingCount}`);

    // ------------------------------------------------------------------
    if (!DEMO_PASSWORD) {
        console.log('\n5. (Bỏ qua) Đặt biến DEMO_PASSWORD để kiểm thử MODERATOR và ADMIN.');
    } else {
        section('5. Quản trị nội dung (MODERATOR và ADMIN)');
        const mod = await login('mod01@demo.local', DEMO_PASSWORD);
        const admin = await login('admin01@demo.local', DEMO_PASSWORD);
        check('mod01 và admin01 đăng nhập được', Boolean(mod) && Boolean(admin));

        const movie = { kind: 'movie', title: `Phim Thử Nghiệm ${stamp}`, releaseYear: 2025, runtimeMin: 110, genreIds: [genreId('comedy')], status: 'published' };
        r = await call('POST', '/titles', { body: { ...movie, runtimeMin: undefined }, cookie: mod });
        check('Phim thiếu runtimeMin trả 422', r.status === 422, `status ${r.status}`);
        r = await call('POST', '/titles', { body: { kind: 'book', title: 'Sách thử', releaseYear: 2020, pageCount: 100, genreIds: [genreId('animation')] }, cookie: mod });
        check('Thể loại hoạt hình gán cho sách trả 422', r.status === 422, `status ${r.status}`);
        r = await call('POST', '/titles', { body: movie, cookie: mod });
        const newId = r.json && r.json.data && r.json.data.id;
        check('MODERATOR tạo phim trả 201 kèm mã MOV-xxxx', r.status === 201 && /^MOV-\d{4}$/.test(r.json.data.code), `status ${r.status} ${JSON.stringify(r.json)}`);
        r = await call('GET', `/titles/${newId}`);
        check('Khách xem được phim mới (đã công bố)', r.status === 200 && r.json.data.stats.ratingCount === 0);
        r = await call('PUT', `/titles/${newId}`, { body: { ...movie, title: `Phim Đã Đổi Tên ${stamp}` }, cookie: mod });
        check('MODERATOR sửa tác phẩm trả 200', r.status === 200, `status ${r.status}`);
        r = await call('PUT', `/titles/${newId}`, { body: { kind: 'book', title: 'Đổi loại', releaseYear: 2020, pageCount: 10, genreIds: [genreId('literature')] }, cookie: mod });
        check('Không đổi được loại phim thành sách (422)', r.status === 422, `status ${r.status}`);

        r = await call('POST', '/titles', { body: { ...movie, title: `Bản nháp ${stamp}`, status: 'draft' }, cookie: mod });
        const draftId = r.json && r.json.data && r.json.data.id;
        r = await call('GET', `/titles/${draftId}`);
        check('Bản nháp: khách nhận 404 (không lộ sự tồn tại)', r.status === 404, `status ${r.status}`);
        r = await call('GET', `/titles/${draftId}`, { cookie: mod });
        check('Bản nháp: MODERATOR xem được', r.status === 200 && r.json.data.status === 'draft', `status ${r.status}`);
        r = await call('GET', '/titles?status=draft&size=50', { cookie: userCookie });
        check('USER truyền status=draft vẫn không thấy bản nháp', r.status === 200 && r.json.data.every((t) => !('status' in t)), `status ${r.status}`);

        r = await call('DELETE', `/titles/${newId}`, { cookie: mod });
        check('MODERATOR xóa tác phẩm trả 403 (chỉ ADMIN)', r.status === 403, `status ${r.status}`);
        r = await call('DELETE', `/titles/${newId}`, { cookie: admin });
        check('ADMIN xóa (ẩn) tác phẩm trả 200', r.status === 200, `status ${r.status}`);
        r = await call('GET', `/titles/${newId}`);
        check('Sau khi xóa, khách nhận 404', r.status === 404, `status ${r.status}`);
        await call('DELETE', `/titles/${draftId}`, { cookie: admin });

        r = await call('PUT', `/titles/${target.id}/rating`, { body: { score: 4 }, cookie: mod });
        check('MODERATOR chấm điểm trả 403 (không có quyền rating.create)', r.status === 403, `status ${r.status}`);

        section('6. Đối soát bảng xếp hạng (ADMIN)');
        r = await call('GET', '/admin/aggregates/reconcile', { cookie: admin });
        check('Đối soát: bảng tổng hợp khớp 100% với ratings', r.status === 200 && r.json.data.consistent === true, `status ${r.status} ${JSON.stringify(r.json && r.json.data && r.json.data.mismatches && r.json.data.mismatches.slice(0, 2))}`);
        const topBefore = (await call('GET', '/titles?size=5')).json.data.map((t) => t.id).join(',');
        r = await call('POST', '/admin/aggregates/rebuild', { cookie: admin });
        check('Dựng lại bảng tổng hợp trả 200', r.status === 200 && r.json.data.titles > 0, `status ${r.status} ${JSON.stringify(r.json)}`);
        const topAfter = (await call('GET', '/titles?size=5')).json.data.map((t) => t.id).join(',');
        check('Sau khi dựng lại, thứ hạng top 5 không đổi', topBefore === topAfter, `${topBefore} vs ${topAfter}`);
        r = await call('GET', '/admin/aggregates/reconcile', { cookie: admin });
        check('Đối soát lại vẫn nhất quán', r.status === 200 && r.json.data.consistent === true);
        r = await call('GET', '/admin/system-logs?page=1&size=100', { cookie: admin });
        const actions = new Set(((r.json && r.json.data) || []).map((x) => x.action));
        check('Nhật ký ghi nhận TITLE_CREATE, TITLE_DELETE, RATING_UPSERT',
            r.status === 200 && ['TITLE_CREATE', 'TITLE_DELETE', 'RATING_UPSERT'].every((a) => actions.has(a)), [...actions].join(','));
        r = await call('GET', '/admin/system-logs?page=0', { cookie: admin });
        check('Nhật ký: page=0 trả 422', r.status === 422, `status ${r.status}`);
    }

    console.log(`\nKết quả: ${passed} đạt, ${failed} lỗi`);
    console.log('Dọn tài khoản thử (tùy chọn): DELETE FROM users WHERE email LIKE \'smoke\\_%\' OR email LIKE \'load\\_%\';');
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error('Không chạy được kiểm thử:', error.message);
    process.exit(1);
});
