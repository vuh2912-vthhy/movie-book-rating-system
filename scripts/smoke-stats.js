#!/usr/bin/env node
'use strict';
/**
 * Kiểm thử khói Ngày 4: xếp hạng, báo cáo thống kê, xuất CSV/Excel, nhật ký có bộ lọc.
 *   node scripts/smoke-stats.js                          -> http://localhost:3000
 *   node scripts/smoke-stats.js https://ten-mien.app     -> trực tuyến
 * Phần nhân viên cần mật khẩu demo của mod01 và admin01:
 *   $env:DEMO_PASSWORD='mat-khau-demo'; node scripts/smoke-stats.js
 * Kịch bản tạo 2 tác phẩm thử có tiêu đề chứa dấu phẩy, nháy kép, chấm phẩy và ký tự "=" để kiểm tra xuất CSV, rồi ẩn chúng.
 * Cần Node 18 trở lên. Chụp ảnh kết quả làm bằng chứng cho Buổi 07, khối K7, K8 và Chương 5.4.
 */
const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const API = `${BASE}/api/v1`;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
    if (ok) passed += 1; else failed += 1;
    console.log(`${ok ? '  ĐẠT ' : '  LỖI '} ${name}${ok ? '' : `  -> ${detail}`}`);
};
const section = (t) => console.log(`\n${t}`);

async function call(method, path, { body, cookie, raw } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const buf = Buffer.from(await res.arrayBuffer());
    let json = null;
    if (!raw) { try { json = JSON.parse(buf.toString('utf8')); } catch (e) { /* không phải JSON */ } }
    const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    return { status: res.status, json, buf, headers: res.headers, cookie: (sc.find((c) => c.startsWith('accessToken=')) || '').split(';')[0] || null };
}
const code = (r) => (r.json && r.json.error ? r.json.error.code : undefined);
const login = async (e, p) => (await call('POST', '/auth/login', { body: { email: e, password: p } })).cookie;
const timing = (r) => { const m = /dur=([\d.]+)/.exec(r.headers.get('server-timing') || ''); return m ? Number(m[1]) : null; };

// Bộ đọc CSV theo RFC 4180 (để chứng minh dữ liệu xuất ra đọc lại đúng)
function parseCsv(text, delimiter = ',') {
    const src = text.replace(/^\uFEFF/, '');
    const rows = []; let row = []; let field = ''; let quoted = false;
    for (let i = 0; i < src.length; i += 1) {
        const ch = src[i];
        if (quoted) { if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; } else field += ch; }
        else if (ch === '"') quoted = true;
        else if (ch === delimiter) { row.push(field); field = ''; }
        else if (ch === '\r') { /* bỏ qua */ }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
}

(async () => {
    console.log(`\nKiểm thử khói Ngày 4 tại ${API}`);
    const stamp = Date.now();
    const email = `stats_${stamp}@demo.local`;
    await call('POST', '/auth/register', { body: { email, password: 'MatKhau12345', fullName: 'Nguyen Stats' } });
    const U = await login(email, 'MatKhau12345');
    const mod = DEMO_PASSWORD ? await login('mod01@demo.local', DEMO_PASSWORD) : null;
    const admin = DEMO_PASSWORD ? await login('admin01@demo.local', DEMO_PASSWORD) : null;
    const staff = Boolean(mod && admin);
    check('Tạo tài khoản thường và (nếu có mật khẩu demo) đăng nhập mod01, admin01', Boolean(U) && (!DEMO_PASSWORD || staff));

    // ------------------------------------------------------------------
    section('1. Bảng xếp hạng công khai (khách, không cần đăng nhập)');
    let r = await call('GET', '/stats/ranking');
    check('GET /stats/ranking trả 200, mặc định 10 mục', r.status === 200 && r.json.data.length === 10, `status ${r.status}`);
    const rk = r.json.data;
    check('Mỗi mục có hạng, mã, tiêu đề, số lượt chấm, điểm trung bình, điểm xếp hạng', rk.every((x, i) => x.rank === i + 1 && x.code && x.title && x.ratingCount >= 0 && x.weightedScore > 0));
    check('Thứ tự giảm dần theo điểm xếp hạng', rk.every((x, i) => i === 0 || rk[i - 1].weightedScore >= x.weightedScore));
    check('Xếp hạng tin cậy: tác phẩm đầu bảng có từ 25 lượt chấm trở lên', rk[0].ratingCount >= 25, `ratingCount ${rk[0].ratingCount}`);
    check('Meta nêu nguồn dữ liệu, m = 25 và điểm trung bình toàn hệ thống C', r.json.meta.source === 'aggregate' && r.json.meta.minVotes === 25 && r.json.meta.priorMean > 0);
    const tAgg = timing(r);
    const live = await call('GET', '/stats/ranking?source=live');
    const tLive = timing(live);
    check('source=live (tính khi đọc từ bảng ratings) trả 200', live.status === 200 && live.json.meta.source === 'live', `status ${live.status}`);
    check('Hai phương án cho cùng 5 tác phẩm đầu bảng và điểm xếp hạng khớp (sai số < 0,02)',
        live.json.data.slice(0, 5).every((x, i) => x.id === rk[i].id && Math.abs(x.weightedScore - rk[i].weightedScore) < 0.02),
        `${live.json.data.slice(0, 5).map((x) => x.id)} vs ${rk.slice(0, 5).map((x) => x.id)}`);
    console.log(`        (thời gian xử lý ở máy chủ: aggregate ${tAgg} ms, live ${tLive} ms; số liệu phục vụ Mục 5.4, cần đo nhiều lần)`);
    r = await call('GET', '/stats/ranking?kind=book&limit=5');
    check('Lọc kind=book, limit=5', r.status === 200 && r.json.data.length === 5 && r.json.data.every((x) => x.kind === 'book'), `status ${r.status}`);
    r = await call('GET', '/stats/ranking?genre=drama&limit=20');
    check('Lọc theo thể loại drama', r.status === 200 && r.json.data.length > 0 && r.json.meta.genre === 'drama', `status ${r.status}`);
    for (const [q, label] of [['limit=0', 'limit=0'], ['limit=51', 'limit=51'], ['source=x', 'source sai'], ['kind=song', 'kind sai'], ['genre=A%20B', 'genre sai']]) {
        r = await call('GET', `/stats/ranking?${q}`);
        check(`Tham số ${label} trả 422`, r.status === 422 && code(r) === 'VALIDATION_FAILED', `status ${r.status}`);
    }

    // ------------------------------------------------------------------
    section('2. Phân quyền báo cáo chuyên sâu (BM5)');
    for (const path of ['/stats/genres', '/stats/timeline', '/stats/overview']) {
        r = await call('GET', path);
        check(`Khách gọi ${path} trả 401`, r.status === 401, `status ${r.status}`);
        r = await call('GET', path, { cookie: U });
        check(`USER gọi ${path} trả 403`, r.status === 403 && code(r) === 'FORBIDDEN', `status ${r.status}`);
    }
    r = await call('GET', '/stats/export?report=genres', { cookie: U });
    check('USER xuất báo cáo trả 403', r.status === 403, `status ${r.status}`);
    r = await call('GET', '/stats/export?report=genres');
    check('Khách xuất báo cáo trả 401', r.status === 401, `status ${r.status}`);
    r = await call('GET', '/admin/system-logs?action=LOGIN_FAILED', { cookie: U });
    check('USER xem nhật ký trả 403', r.status === 403, `status ${r.status}`);

    if (!staff) {
        console.log('\n3–8. (Bỏ qua) Đặt biến DEMO_PASSWORD để kiểm thử báo cáo, xuất tệp và bộ lọc nhật ký.');
    } else {
        r = await call('GET', '/stats/export?report=genres', { cookie: mod });
        check('MODERATOR xuất báo cáo trả 403 (chỉ ADMIN có stats.export)', r.status === 403, `status ${r.status}`);
        r = await call('GET', '/admin/system-logs', { cookie: mod });
        check('MODERATOR xem nhật ký trả 403', r.status === 403, `status ${r.status}`);

        // ------------------------------------------------------------------
        section('3. Báo cáo theo thể loại (nhiều bảng, hàm tổng hợp, hàm cửa sổ)');
        r = await call('GET', '/stats/genres', { cookie: mod });
        const gs = r.json && r.json.data;
        check('MODERATOR xem báo cáo thể loại trả 200, đủ các thể loại', r.status === 200 && gs.length >= 10, `status ${r.status}`);
        check('Sắp xếp theo số lượt chấm giảm dần', gs.every((x, i) => i === 0 || gs[i - 1].ratingCount >= x.ratingCount));
        check('Mỗi thể loại có số tác phẩm, lượt chấm, điểm trung bình và tác phẩm đứng đầu', gs.filter((x) => x.titleCount > 0).every((x) => x.topTitle && x.topTitle.title && x.ratingAvg !== null));
        const dr = gs.find((x) => x.code === 'drama');
        let sumRatings = 0; let titles = 0; let page = 1; let totalPages = 1;
        do {
            const t = await call('GET', `/titles?genre=drama&size=50&page=${page}`);
            totalPages = t.json.pagination.totalPages;
            titles = t.json.pagination.total;
            sumRatings += t.json.data.reduce((s, x) => s + x.stats.ratingCount, 0);
            page += 1;
        } while (page <= totalPages);
        check('Đối chiếu chéo thể loại drama: số tác phẩm và số lượt chấm khớp tổng từ danh sách tác phẩm', dr.titleCount === titles && dr.ratingCount === sumRatings, `báo cáo ${dr.titleCount}/${dr.ratingCount} vs danh sách ${titles}/${sumRatings}`);
        r = await call('GET', '/stats/genres?kind=movie', { cookie: admin });
        const movieAnim = r.json.data.find((x) => x.code === 'animation');
        r = await call('GET', '/stats/genres?kind=book', { cookie: admin });
        check('Lọc kind: hoạt hình chỉ có ở phim', movieAnim.titleCount > 0 && r.json.data.find((x) => x.code === 'animation').titleCount === 0);

        // ------------------------------------------------------------------
        section('4. Báo cáo theo thời gian và tổng quan');
        const ov = (await call('GET', '/stats/overview', { cookie: mod })).json.data;
        r = await call('GET', '/stats/timeline?months=36', { cookie: mod });
        const tl = r.json && r.json.data;
        check('Theo tháng: 36 kỳ liên tục, tăng dần, định dạng YYYY-MM', r.status === 200 && tl.length === 36 && tl.every((x, i) => /^\d{4}-\d{2}$/.test(x.period) && (i === 0 || tl[i - 1].period < x.period)), `status ${r.status}`);
        check('Tổng lượt chấm theo tháng = tổng lượt chấm hệ thống (không mất, không trùng)', r.json.totals.ratings === ov.ratings.total, `${r.json.totals.ratings} vs ${ov.ratings.total}`);
        check('Tổng bình luận theo tháng = tổng bình luận hệ thống', r.json.totals.reviews === ov.reviews.total, `${r.json.totals.reviews} vs ${ov.reviews.total}`);
        r = await call('GET', '/stats/timeline?granularity=day&days=30', { cookie: mod });
        check('Theo ngày: 30 ngày liên tục, kỳ cuối là hôm nay (UTC)', r.status === 200 && r.json.data.length === 30 && r.json.data[29].period === new Date().toISOString().slice(0, 10), `status ${r.status}`);
        r = await call('GET', '/stats/timeline?months=36&kind=book', { cookie: mod });
        check('Lọc kind=book: số lượt chấm nhỏ hơn tổng', r.status === 200 && r.json.totals.ratings < ov.ratings.total);
        for (const q of ['months=0', 'months=37', 'days=91', 'granularity=year']) {
            r = await call('GET', `/stats/timeline?${q}`, { cookie: mod });
            check(`timeline với ${q} trả 422`, r.status === 422, `status ${r.status}`);
        }
        check('Tổng quan: tổng bình luận = chờ duyệt + đã duyệt + từ chối + bị ẩn', ov.reviews.total === ov.reviews.pending + ov.reviews.approved + ov.reviews.rejected + ov.reviews.hidden);

        // ------------------------------------------------------------------
        section('5. Xuất CSV (ADMIN)');
        r = await call('GET', '/stats/export?report=genres', { cookie: admin, raw: true });
        const type = r.headers.get('content-type') || '';
        check('Xuất CSV theo thể loại trả 200, Content-Type text/csv, tên tệp .csv',
            r.status === 200 && type.startsWith('text/csv') && /attachment; filename="bao-cao-genres-\d{8}\.csv"/.test(r.headers.get('content-disposition') || ''), `status ${r.status} ${type}`);
        const text = r.buf.toString('utf8');
        check('Tệp có BOM UTF-8 (Excel hiển thị đúng tiếng Việt)', text.charCodeAt(0) === 0xFEFF);
        const rows = parseCsv(text);
        check('Mọi dòng có đủ số cột, số dòng = số thể loại + tiêu đề', rows.every((x) => x.length === rows[0].length) && rows.length === gs.length + 1, `${rows.length} dòng`);
        r = await call('GET', '/stats/export?report=ranking&limit=5&delimiter=semicolon', { cookie: admin, raw: true });
        const semi = r.buf.toString('utf8');
        check('Dấu phân cách chấm phẩy (Excel tiếng Việt): đọc lại 5 dòng + tiêu đề', r.status === 200 && parseCsv(semi, ';').length === 6, `status ${r.status}`);

        const comedy = (await call('GET', '/genres')).json.data.find((g) => g.code === 'comedy').id;
        const lit = (await call('GET', '/genres')).json.data.find((g) => g.code === 'literature').id;
        const name1 = `Phim "Thử", dấu; phẩy ${stamp}`;
        const name2 = `=HYPERLINK("http://x","bấm") ${stamp}`;
        const c1 = await call('POST', '/titles', { body: { kind: 'movie', title: name1, releaseYear: 2025, runtimeMin: 100, genreIds: [comedy] }, cookie: mod });
        const c2 = await call('POST', '/titles', { body: { kind: 'book', title: name2, releaseYear: 2024, pageCount: 200, genreIds: [lit] }, cookie: mod });
        check('Tạo 2 tác phẩm thử có ký tự đặc biệt trong tiêu đề', c1.status === 201 && c2.status === 201, `${c1.status}/${c2.status}`);
        for (const [d, dl] of [['comma', ','], ['semicolon', ';']]) {
            r = await call('GET', `/stats/export?report=catalog&delimiter=${d}`, { cookie: admin, raw: true });
            const cat = parseCsv(r.buf.toString('utf8'), dl);
            const row1 = cat.find((x) => x[0] === (c1.json.data && c1.json.data.code));
            const row2 = cat.find((x) => x[0] === (c2.json.data && c2.json.data.code));
            check(`Dấu "${dl}": tiêu đề có dấu phẩy, nháy kép, chấm phẩy xuất rồi đọc lại đúng nguyên văn`, Boolean(row1) && row1[2] === name1 && cat.every((x) => x.length === cat[0].length), row1 && row1[2]);
            check(`Dấu "${dl}": tiêu đề bắt đầu bằng "=" bị vô hiệu hóa công thức (CSV injection)`, Boolean(row2) && row2[2] === `'${name2}`, row2 && row2[2]);
        }

        // ------------------------------------------------------------------
        section('6. Xuất Excel (ADMIN)');
        r = await call('GET', '/stats/export?report=genres&format=xlsx', { cookie: admin, raw: true });
        const xtype = r.headers.get('content-type') || '';
        check('Xuất .xlsx trả 200, đúng Content-Type và tên tệp', r.status === 200 && xtype.includes('spreadsheetml') && /\.xlsx"/.test(r.headers.get('content-disposition') || ''), `status ${r.status} ${xtype} ${r.buf.toString('utf8').slice(0, 120)}`);
        check('Tệp là gói zip hợp lệ của Excel (bắt đầu bằng "PK") và có nội dung', r.buf.slice(0, 2).toString() === 'PK' && r.buf.length > 1500, `${r.buf.length} byte`);
        for (const [q, label] of [['report=genres&format=pdf', 'format sai'], ['format=csv', 'thiếu report'], ['report=x', 'report sai'], ['report=genres&delimiter=tab', 'delimiter sai']]) {
            r = await call('GET', `/stats/export?${q}`, { cookie: admin });
            check(`Xuất với ${label} trả 422`, r.status === 422, `status ${r.status}`);
        }
        for (const id of [c1, c2]) if (id.json && id.json.data) await call('DELETE', `/titles/${id.json.data.id}`, { cookie: admin });

        // ------------------------------------------------------------------
        section('7. Nhật ký hệ thống có bộ lọc (ADMIN)');
        r = await call('GET', '/admin/system-logs?action=LOGIN_FAILED&size=100', { cookie: admin });
        check('Lọc theo action=LOGIN_FAILED: mọi dòng đúng hành động', r.status === 200 && r.json.data.every((x) => x.action === 'LOGIN_FAILED'), `status ${r.status}`);
        const withUser = (await call('GET', '/admin/system-logs?action=REGISTER&size=5', { cookie: admin })).json.data[0];
        r = await call('GET', `/admin/system-logs?userId=${withUser.userId}&size=100`, { cookie: admin });
        check('Lọc theo người thực hiện (userId)', r.status === 200 && r.json.data.length > 0 && r.json.data.every((x) => x.userId === withUser.userId), `status ${r.status}`);
        r = await call('GET', '/admin/system-logs?entity=reviews&size=100', { cookie: admin });
        check('Lọc theo đối tượng (entity=reviews)', r.status === 200 && r.json.data.every((x) => x.entity === 'reviews'), `status ${r.status}`);
        const today = new Date().toISOString().slice(0, 10);
        r = await call('GET', `/admin/system-logs?from=${today}&to=${today}&size=100`, { cookie: admin });
        check('Lọc theo khoảng thời gian (từ đầu đến hết ngày hôm nay, UTC)', r.status === 200 && r.json.data.length > 0 && r.json.data.every((x) => x.createdAt >= `${today} 00:00:00` && x.createdAt <= `${today} 23:59:59`), `status ${r.status}`);
        r = await call('GET', '/admin/system-logs?action=LOGIN_SUCCESS&entity=users&from=2020-01-01&size=50', { cookie: admin });
        check('Kết hợp nhiều điều kiện', r.status === 200 && r.json.data.every((x) => x.action === 'LOGIN_SUCCESS' && x.entity === 'users'), `status ${r.status}`);
        const p1 = (await call('GET', '/admin/system-logs?action=LOGIN_SUCCESS&size=50&page=1', { cookie: admin })).json.data.map((x) => x.id);
        const p2 = (await call('GET', '/admin/system-logs?action=LOGIN_SUCCESS&size=50&page=2', { cookie: admin })).json.data.map((x) => x.id);
        check('Phân trang theo bộ lọc không lặp bản ghi giữa các trang', p1.length === 50 && p2.length > 0 && !p2.some((id) => p1.includes(id)));
        for (const [q, label] of [['from=2026-02-31', 'ngày không có thật'], ["action=x'%3B%20DROP", 'action chứa SQL'], ['from=2026-10-12&to=2026-10-01', 'from sau to'], ['userId=-1', 'userId âm']]) {
            r = await call('GET', `/admin/system-logs?${q}`, { cookie: admin });
            check(`Bộ lọc ${label} trả 422`, r.status === 422, `status ${r.status}`);
        }
        r = await call('GET', '/admin/system-logs/actions', { cookie: admin });
        check('Danh sách hành động có LOGIN_SUCCESS và STATS_EXPORT (cho ô chọn lọc)', r.status === 200 && r.json.data.includes('LOGIN_SUCCESS') && r.json.data.includes('STATS_EXPORT'), `status ${r.status}`);
        r = await call('GET', '/admin/system-logs?action=STATS_EXPORT&size=5', { cookie: admin });
        check('Việc xuất báo cáo được ghi nhật ký STATS_EXPORT', r.status === 200 && r.json.pagination.total >= 3, `total ${r.json && r.json.pagination && r.json.pagination.total}`);

        section('8. Đối soát sau toàn bộ kịch bản');
        r = await call('GET', '/admin/aggregates/reconcile', { cookie: admin });
        check('Bảng tổng hợp vẫn khớp 100% với dữ liệu gốc', r.status === 200 && r.json.data.consistent === true, `status ${r.status}`);
    }

    console.log(`\nKết quả: ${passed} đạt, ${failed} lỗi`);
    console.log("Dọn tài khoản thử (tùy chọn): DELETE FROM users WHERE email LIKE 'stats\\_%';");
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error('Không chạy được kiểm thử:', error.message);
    process.exit(1);
});
