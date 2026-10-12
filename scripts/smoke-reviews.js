#!/usr/bin/env node
'use strict';
/**
 * Kiểm thử khói Ngày 3: bình luận, duyệt (máy trạng thái), bình chọn, báo cáo vi phạm, watchlist, thông báo.
 *   node scripts/smoke-reviews.js                          -> http://localhost:3000
 *   node scripts/smoke-reviews.js https://ten-mien.app     -> trực tuyến
 * Phần kiểm duyệt cần tài khoản mod01 và admin01 (mật khẩu demo đã dùng khi sinh seed):
 *   $env:DEMO_PASSWORD='mat-khau-demo'; node scripts/smoke-reviews.js
 * Mỗi lần chạy tạo 5 tài khoản review_*@demo.local và dọn dữ liệu bình luận, điểm, watchlist của chúng ở cuối.
 * Cần Node 18 trở lên. Chụp ảnh kết quả làm bằng chứng cho Buổi 05, 06 và các mục BM4, BM5.
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

async function call(method, path, { body, cookie } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* không phải JSON */ }
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    return { status: res.status, json, setCookies };
}
const code = (r) => (r.json && r.json.error ? r.json.error.code : undefined);
const cookieOf = (r) => { const c = r.setCookies.find((x) => x.startsWith('accessToken=')); return c ? c.split(';')[0] : null; };
const login = async (email, password) => cookieOf(await call('POST', '/auth/login', { body: { email, password } }));
const make = async (email, password, name) => {
    await call('POST', '/auth/register', { body: { email, password, fullName: name } });
    return login(email, password);
};

(async () => {
    console.log(`\nKiểm thử khói Ngày 3 tại ${API}`);
    const stamp = Date.now();
    const password = 'MatKhau12345';
    const marker = `smoke-${stamp}`;
    const [A, B, C, D, E] = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((k) => make(`review_${stamp}_${k}@demo.local`, password, `Nguyen Review ${k.toUpperCase()}`)));
    check('Tạo và đăng nhập 5 tài khoản thử (A, B, C, D, E)', [A, B, C, D, E].every(Boolean));
    const mod = DEMO_PASSWORD ? await login('mod01@demo.local', DEMO_PASSWORD) : null;
    const admin = DEMO_PASSWORD ? await login('admin01@demo.local', DEMO_PASSWORD) : null;
    const staff = Boolean(mod && admin);

    const pop = await call('GET', '/titles?sort=popular&page=4&size=12');
    const T = pop.json.data[0].id;
    const detail = async () => (await call('GET', `/titles/${T}`)).json.data;
    const reviewCount = async () => (await detail()).stats.reviewCount;
    const base = await reviewCount();
    const listIds = async (cookie, query = '') => ((await call('GET', `/titles/${T}/reviews?size=50${query}`, { cookie })).json.data || []).map((x) => x.id);
    const lastPage = async (path) => {
        const first = await call('GET', `${path}${path.includes('?') ? '&' : '?'}size=50`, { cookie: mod });
        const last = first.json.pagination.totalPages;
        return (await call('GET', `${path}${path.includes('?') ? '&' : '?'}size=50&page=${last}`, { cookie: mod })).json.data;
    };

    // ------------------------------------------------------------------
    section('1. Danh sách bình luận công khai (khách)');
    let r = await call('GET', `/titles/${T}/reviews`);
    check('GET /titles/:id/reviews trả 200, có phân trang và số phiếu', r.status === 200 && Array.isArray(r.json.data) && r.json.pagination && (r.json.data.length === 0 || r.json.data[0].votes), `status ${r.status}`);
    r = await call('GET', `/titles/${T}/reviews?sort=helpful`);
    check('Sắp xếp theo hữu ích (sort=helpful) trả 200', r.status === 200, `status ${r.status}`);
    r = await call('GET', `/titles/${T}/reviews?sort=random`);
    check('sort ngoài danh sách cho phép trả 422', r.status === 422, `status ${r.status}`);
    r = await call('GET', '/titles/abc/reviews');
    check('Mã tác phẩm không phải số trả 422', r.status === 422, `status ${r.status}`);
    r = await call('GET', '/titles/99999999/reviews');
    check('Tác phẩm không tồn tại trả 404', r.status === 404, `status ${r.status}`);

    section('2. Phân quyền ở máy chủ (BM5)');
    r = await call('POST', `/titles/${T}/reviews`, { body: { body: 'Khách không được bình luận' } });
    check('Khách bình luận trả 401', r.status === 401, `status ${r.status}`);
    r = await call('PUT', '/reviews/1/vote', { body: { vote: 1 } });
    check('Khách bình chọn trả 401', r.status === 401, `status ${r.status}`);
    r = await call('GET', '/moderation/reviews');
    check('Khách vào hàng đợi kiểm duyệt trả 401', r.status === 401, `status ${r.status}`);
    r = await call('GET', '/moderation/reviews', { cookie: A });
    check('USER vào hàng đợi kiểm duyệt trả 403', r.status === 403 && code(r) === 'FORBIDDEN', `status ${r.status}`);
    r = await call('POST', '/moderation/reviews/1/moderate', { body: { action: 'approve' }, cookie: A });
    check('USER duyệt bình luận trả 403', r.status === 403, `status ${r.status}`);
    r = await call('POST', '/moderation/reports/1/handle', { body: { decision: 'resolve' }, cookie: A });
    check('USER xử lý báo cáo trả 403', r.status === 403, `status ${r.status}`);
    r = await call('GET', '/me/watchlist');
    check('Khách xem watchlist trả 401', r.status === 401, `status ${r.status}`);
    if (staff) {
        r = await call('PUT', '/reviews/1/vote', { body: { vote: 1 }, cookie: mod });
        check('MODERATOR bình chọn trả 403 (không có quyền vote.create)', r.status === 403, `status ${r.status}`);
        r = await call('PUT', `/me/watchlist/${T}`, { body: { listType: 'want' }, cookie: mod });
        check('MODERATOR dùng watchlist trả 403', r.status === 403, `status ${r.status}`);
    }

    // ------------------------------------------------------------------
    section('3. Viết bình luận');
    r = await call('POST', `/titles/${T}/reviews`, { body: { body: `${marker} chưa chấm điểm` }, cookie: A });
    check('Chưa chấm điểm mà bình luận trả 403 RATING_REQUIRED', r.status === 403 && code(r) === 'RATING_REQUIRED', `status ${r.status} ${code(r)}`);
    r = await call('PUT', `/titles/${T}/rating`, { body: { score: 4 }, cookie: A });
    check('A chấm 4 sao', r.status === 201, `status ${r.status}`);
    r = await call('POST', `/titles/${T}/reviews`, { body: { body: 'ngắn' }, cookie: A });
    check('Bình luận quá ngắn trả 422', r.status === 422, `status ${r.status}`);
    r = await call('POST', `/titles/${T}/reviews`, { body: { body: 12345678901 }, cookie: A });
    check('Nội dung sai kiểu (số) trả 422', r.status === 422, `status ${r.status}`);
    r = await call('POST', `/titles/${T}/reviews`, { body: { body: `${marker} Một tác phẩm rất đáng xem, nhiều ý nghĩa <3` }, cookie: A });
    const rid = r.json && r.json.data && r.json.data.id;
    check('A gửi bình luận trả 201, trạng thái pending', r.status === 201 && r.json.data.status === 'pending', `status ${r.status} ${JSON.stringify(r.json)}`);
    r = await call('POST', `/titles/${T}/reviews`, { body: { body: `${marker} bình luận lần hai` }, cookie: A });
    check('Bình luận lần hai cùng tác phẩm trả 409 REVIEW_EXISTS', r.status === 409 && code(r) === 'REVIEW_EXISTS', `status ${r.status}`);
    r = await call('GET', `/titles/${T}/reviews/mine`, { cookie: A });
    check('GET bình luận của tôi: pending', r.status === 200 && r.json.data.status === 'pending', `status ${r.status}`);
    r = await call('GET', `/titles/${T}/reviews/mine`, { cookie: B });
    check('Người khác chưa bình luận: 404 REVIEW_NOT_FOUND', r.status === 404 && code(r) === 'REVIEW_NOT_FOUND', `status ${r.status}`);
    check('Bình luận chờ duyệt KHÔNG hiện ở danh sách công khai', !(await listIds()).includes(rid));
    check('review_count chưa tăng khi còn chờ duyệt', (await reviewCount()) === base);

    if (!staff) {
        console.log('\n4–9. (Bỏ qua) Đặt biến DEMO_PASSWORD để kiểm thử duyệt, bình chọn, báo cáo, đồng thời, đối soát.');
    } else {
        // ------------------------------------------------------------------
        section('4. Duyệt bình luận (máy trạng thái)');
        const queue = await lastPage('/moderation/reviews?status=pending');
        check('Hàng đợi chờ duyệt có bình luận của A', queue.some((x) => x.id === rid && x.status === 'pending'));
        r = await call('GET', '/moderation/reviews?status=bad', { cookie: mod });
        check('Lọc status sai trả 422', r.status === 422, `status ${r.status}`);
        r = await call('POST', `/moderation/reviews/${rid}/moderate`, { body: { action: 'delete' }, cookie: mod });
        check('action ngoài danh sách trả 422', r.status === 422, `status ${r.status}`);
        r = await call('POST', `/moderation/reviews/${rid}/moderate`, { body: { action: 'hide' }, cookie: mod });
        check('pending → hide trả 422 INVALID_TRANSITION', r.status === 422 && code(r) === 'INVALID_TRANSITION', `status ${r.status} ${code(r)}`);
        r = await call('POST', '/moderation/reviews/99999999/moderate', { body: { action: 'approve' }, cookie: mod });
        check('Bình luận không tồn tại trả 404', r.status === 404, `status ${r.status}`);
        r = await call('POST', `/moderation/reviews/${rid}/moderate`, { body: { action: 'approve' }, cookie: mod });
        check('approve: pending → approved', r.status === 200 && r.json.data.status === 'approved', `status ${r.status} ${JSON.stringify(r.json)}`);
        r = await call('POST', `/moderation/reviews/${rid}/moderate`, { body: { action: 'approve' }, cookie: mod });
        check('approve lần hai trả 422 INVALID_TRANSITION', r.status === 422 && code(r) === 'INVALID_TRANSITION', `status ${r.status}`);
        r = await call('POST', `/moderation/reviews/${rid}/moderate`, { body: { action: 'reject' }, cookie: mod });
        check('approved → reject trả 422 INVALID_TRANSITION', r.status === 422 && code(r) === 'INVALID_TRANSITION', `status ${r.status}`);
        check('Bình luận đã duyệt hiện ở danh sách công khai', (await listIds()).includes(rid));
        check('review_count tăng đúng 1', (await reviewCount()) === base + 1);
        r = await call('GET', '/me/notifications', { cookie: A });
        const note = r.json && r.json.data && r.json.data.find((x) => x.type === 'REVIEW_APPROVED');
        check('A nhận thông báo REVIEW_APPROVED chưa đọc', r.status === 200 && Boolean(note) && r.json.unreadCount >= 1, `status ${r.status}`);
        r = await call('POST', `/me/notifications/${note && note.id}/read`, { cookie: B });
        check('B đánh dấu đã đọc thông báo của A trả 404 (chống IDOR, BM4)', r.status === 404 && code(r) === 'NOTIFICATION_NOT_FOUND', `status ${r.status}`);
        r = await call('POST', `/me/notifications/${note && note.id}/read`, { cookie: A });
        check('A đánh dấu đã đọc thành công', r.status === 200 && r.json.data.isRead === true, `status ${r.status}`);
        r = await call('POST', '/me/notifications/read-all', { cookie: A });
        check('Đánh dấu tất cả đã đọc', r.status === 200, `status ${r.status}`);

        // ------------------------------------------------------------------
        section('5. Sửa bình luận và bình luận bị ẩn');
        r = await call('PUT', `/titles/${T}/reviews/mine`, { body: { body: `${marker} Đã xem lại lần hai, phim càng hay hơn trước.` }, cookie: A });
        check('A sửa bình luận đã duyệt: quay về pending', r.status === 200 && r.json.data.status === 'pending' && r.json.data.previousStatus === 'approved', `status ${r.status}`);
        check('review_count giảm lại về mức ban đầu', (await reviewCount()) === base);
        r = await call('PUT', `/titles/${T}/reviews/mine`, { body: { body: `${marker} Người khác sửa bình luận` }, cookie: B });
        check('B sửa bình luận trả 404 (chỉ sửa được bình luận của chính mình)', r.status === 404, `status ${r.status}`);
        await call('POST', `/moderation/reviews/${rid}/moderate`, { body: { action: 'reject', note: 'Nội dung chưa rõ ràng' }, cookie: mod });
        r = await call('GET', '/me/notifications?unread=true', { cookie: A });
        check('Thông báo từ chối kèm lý do', r.status === 200 && r.json.data.some((x) => x.type === 'REVIEW_REJECTED' && x.message.includes('Nội dung chưa rõ ràng')));
        r = await call('GET', '/me/reviews', { cookie: A });
        check('GET /me/reviews thấy bình luận ở trạng thái rejected', r.status === 200 && r.json.data.some((x) => x.id === rid && x.status === 'rejected'), `status ${r.status}`);
        r = await call('PUT', `/titles/${T}/reviews/mine`, { body: { body: `${marker} Đã bổ sung chi tiết cho bình luận này.` }, cookie: A });
        check('Bình luận bị từ chối: sửa lại thì về pending', r.status === 200 && r.json.data.status === 'pending', `status ${r.status}`);
        await call('POST', `/moderation/reviews/${rid}/moderate`, { body: { action: 'approve' }, cookie: mod });
        await call('POST', `/moderation/reviews/${rid}/moderate`, { body: { action: 'hide' }, cookie: mod });
        r = await call('PUT', `/titles/${T}/reviews/mine`, { body: { body: `${marker} Cố sửa bình luận đã bị ẩn đi` }, cookie: A });
        check('Bình luận đã bị ẩn: tác giả sửa trả 403 REVIEW_HIDDEN', r.status === 403 && code(r) === 'REVIEW_HIDDEN', `status ${r.status} ${code(r)}`);
        r = await call('POST', `/moderation/reviews/${rid}/moderate`, { body: { action: 'restore' }, cookie: admin });
        check('ADMIN khôi phục bình luận (hidden → approved)', r.status === 200 && r.json.data.status === 'approved', `status ${r.status}`);

        // ------------------------------------------------------------------
        section('6. Bình chọn hữu ích');
        r = await call('PUT', `/reviews/${rid}/vote`, { body: { vote: 1 }, cookie: B });
        check('B bình chọn hữu ích trả 201, up = 1', r.status === 201 && r.json.data.votes.up === 1, `status ${r.status}`);
        r = await call('PUT', `/reviews/${rid}/vote`, { body: { vote: 1 }, cookie: B });
        check('Bình chọn lại cùng giá trị trả 200 (idempotent)', r.status === 200 && r.json.data.votes.up === 1, `status ${r.status}`);
        r = await call('PUT', `/reviews/${rid}/vote`, { body: { vote: -1 }, cookie: B });
        check('Đổi phiếu sang không hữu ích: up 0, down 1', r.status === 200 && r.json.data.votes.up === 0 && r.json.data.votes.down === 1, `status ${r.status}`);
        await call('PUT', `/reviews/${rid}/vote`, { body: { vote: 1 }, cookie: C });
        r = await call('PUT', `/reviews/${rid}/vote`, { body: { vote: 1 }, cookie: A });
        check('A tự bình chọn bình luận của mình trả 403 OWN_REVIEW', r.status === 403 && code(r) === 'OWN_REVIEW', `status ${r.status}`);
        r = await call('PUT', `/reviews/${rid}/vote`, { body: { vote: 2 }, cookie: B });
        check('vote = 2 trả 422', r.status === 422, `status ${r.status}`);
        r = await call('PUT', `/reviews/${rid}/vote`, { body: { vote: '1' }, cookie: B });
        check('vote kiểu chuỗi "1" trả 422', r.status === 422, `status ${r.status}`);
        r = await call('GET', `/titles/${T}/reviews?size=50&sort=helpful`, { cookie: B });
        const mineRow = (r.json.data || []).find((x) => x.id === rid);
        check('Danh sách công khai có votes và myVote của người xem', Boolean(mineRow) && mineRow.votes.up === 1 && mineRow.votes.down === 1 && mineRow.myVote === -1, JSON.stringify(mineRow));
        const burst = await Promise.all([1, 1, -1, 1, -1].map((v) => call('PUT', `/reviews/${rid}/vote`, { body: { vote: v }, cookie: D })));
        check('5 phiếu song song của cùng một người: không lỗi 5xx', burst.every((x) => x.status === 200 || x.status === 201), burst.map((x) => x.status).join(','));
        const after = await call('GET', `/titles/${T}/reviews?size=50`, { cookie: D });
        const row2 = after.json.data.find((x) => x.id === rid);
        check('Sau đó D vẫn chỉ có đúng một phiếu (tổng phiếu = 3: B, C, D)', row2.votes.up + row2.votes.down === 3, JSON.stringify(row2.votes));
        r = await call('DELETE', `/reviews/${rid}/vote`, { cookie: D });
        check('D bỏ phiếu thành công', r.status === 200, `status ${r.status}`);
        r = await call('DELETE', `/reviews/${rid}/vote`, { cookie: D });
        check('Bỏ phiếu lần hai trả 404 VOTE_NOT_FOUND', r.status === 404 && code(r) === 'VOTE_NOT_FOUND', `status ${r.status}`);

        // ------------------------------------------------------------------
        section('7. Báo cáo vi phạm và xử lý');
        r = await call('POST', `/reviews/${rid}/reports`, { body: { reason: 'spam', detail: 'Quảng cáo' }, cookie: B });
        const rp = r.json && r.json.data && r.json.data.id;
        check('B báo cáo bình luận trả 201, trạng thái open', r.status === 201 && r.json.data.status === 'open', `status ${r.status}`);
        r = await call('POST', `/reviews/${rid}/reports`, { body: { reason: 'spam' }, cookie: B });
        check('B báo cáo lần hai trả 409 REPORT_EXISTS', r.status === 409 && code(r) === 'REPORT_EXISTS', `status ${r.status}`);
        r = await call('POST', `/reviews/${rid}/reports`, { body: { reason: 'spam' }, cookie: A });
        check('A tự báo cáo bình luận của mình trả 403 OWN_REVIEW', r.status === 403 && code(r) === 'OWN_REVIEW', `status ${r.status}`);
        r = await call('POST', `/reviews/${rid}/reports`, { body: { reason: 'khong-hop-le' }, cookie: C });
        check('Lý do báo cáo sai trả 422', r.status === 422, `status ${r.status}`);
        const openReports = await lastPage('/moderation/reports?status=open');
        check('Hàng đợi báo cáo mở có báo cáo của B kèm nội dung bình luận', openReports.some((x) => x.id === rp && x.review && x.title));
        r = await call('POST', `/moderation/reports/${rp}/handle`, { body: { decision: 'dismiss' }, cookie: mod });
        check('MODERATOR bác báo cáo: bình luận giữ nguyên', r.status === 200 && r.json.data.reviewHidden === false && r.json.data.reviewStatus === 'approved', `status ${r.status}`);
        r = await call('POST', `/moderation/reports/${rp}/handle`, { body: { decision: 'resolve' }, cookie: mod });
        check('Xử lý báo cáo đã đóng trả 422 REPORT_CLOSED', r.status === 422 && code(r) === 'REPORT_CLOSED', `status ${r.status} ${code(r)}`);
        r = await call('POST', '/moderation/reports/99999999/handle', { body: { decision: 'resolve' }, cookie: mod });
        check('Báo cáo không tồn tại trả 404', r.status === 404, `status ${r.status}`);
        r = await call('POST', `/reviews/${rid}/reports`, { body: { reason: 'offensive' }, cookie: C });
        const rpC = r.json.data.id;
        r = await call('POST', `/reviews/${rid}/reports`, { body: { reason: 'spoiler' }, cookie: D });
        const rpD = r.json.data.id;
        const cBefore = await reviewCount();
        r = await call('POST', `/moderation/reports/${rpC}/handle`, { body: { decision: 'resolve' }, cookie: mod });
        check('resolve: bình luận bị ẩn', r.status === 200 && r.json.data.reviewHidden === true && r.json.data.reviewStatus === 'hidden', `status ${r.status} ${JSON.stringify(r.json)}`);
        check('review_count giảm 1', (await reviewCount()) === cBefore - 1);
        const closed = await call('GET', '/moderation/reports?status=resolved&size=50', { cookie: mod });
        const closedIds = (closed.json.data || []).map((x) => x.id);
        check('Báo cáo mở khác về cùng bình luận được đóng cùng lúc (resolved)', closedIds.includes(rpC) && closedIds.includes(rpD), closedIds.slice(0, 5).join(','));
        check('Bình luận bị ẩn không còn hiển thị công khai', !(await listIds()).includes(rid));
        r = await call('GET', '/me/notifications?unread=true', { cookie: A });
        check('A nhận thông báo REVIEW_HIDDEN', r.status === 200 && r.json.data.some((x) => x.type === 'REVIEW_HIDDEN'), `status ${r.status}`);
        r = await call('GET', '/me/notifications?unread=true', { cookie: D });
        check('D (người báo cáo) nhận thông báo REPORT_HANDLED', r.status === 200 && r.json.data.some((x) => x.type === 'REPORT_HANDLED'), `status ${r.status}`);
        await call('POST', `/moderation/reviews/${rid}/moderate`, { body: { action: 'restore' }, cookie: mod });

        // ------------------------------------------------------------------
        section('8. Đồng thời');
        await call('PUT', `/titles/${T}/reviews/mine`, { body: { body: `${marker} Sửa để thử duyệt đồng thời, nội dung mới.` }, cookie: A });
        const rcBefore = await reviewCount();
        const approvals = await Promise.all(Array.from({ length: 10 }, () => call('POST', `/moderation/reviews/${rid}/moderate`, { body: { action: 'approve' }, cookie: mod })));
        const ok200 = approvals.filter((x) => x.status === 200).length;
        const bad422 = approvals.filter((x) => x.status === 422 && code(x) === 'INVALID_TRANSITION').length;
        check('10 yêu cầu duyệt đồng thời cùng một bình luận: đúng 1 thành công, 9 bị 422', ok200 === 1 && bad422 === 9, `200: ${ok200}, 422: ${bad422}, mã: ${approvals.map((x) => x.status).join(',')}`);
        check('review_count chỉ tăng đúng 1', (await reviewCount()) === rcBefore + 1);
        const reports = await Promise.all([1, 2, 3, 4, 5].map(() => call('POST', `/reviews/${rid}/reports`, { body: { reason: 'spam' }, cookie: E })));
        check('5 báo cáo song song của cùng một người: đúng 1 thành công, 4 bị 409',
            reports.filter((x) => x.status === 201).length === 1 && reports.filter((x) => x.status === 409).length === 4, reports.map((x) => x.status).join(','));
        const openE = reports.find((x) => x.status === 201);
        if (openE) await call('POST', `/moderation/reports/${openE.json.data.id}/handle`, { body: { decision: 'dismiss' }, cookie: mod });

        // ------------------------------------------------------------------
        section('9. Đối soát và nhật ký (ADMIN)');
        r = await call('GET', '/admin/aggregates/reconcile', { cookie: admin });
        check('Bảng tổng hợp (điểm và số bình luận) khớp 100% với dữ liệu gốc', r.status === 200 && r.json.data.consistent === true, `status ${r.status} ${JSON.stringify(r.json && r.json.data && r.json.data.mismatches && r.json.data.mismatches.slice(0, 2))}`);
        r = await call('GET', '/admin/system-logs?page=1&size=100', { cookie: admin });
        const actions = new Set(((r.json && r.json.data) || []).map((x) => x.action));
        check('Nhật ký ghi REVIEW_APPROVE, REVIEW_HIDE, REPORT_RESOLVE, REPORT_DISMISS, REVIEW_CREATE',
            ['REVIEW_APPROVE', 'REVIEW_HIDE', 'REPORT_RESOLVE', 'REPORT_DISMISS', 'REVIEW_CREATE'].every((a) => actions.has(a)), [...actions].join(','));
    }

    // ------------------------------------------------------------------
    section('10. Danh sách theo dõi (Watchlist)');
    const T2 = pop.json.data[1].id;
    r = await call('PUT', `/me/watchlist/${T}`, { body: { listType: 'want' }, cookie: C });
    check('Thêm vào watchlist trả 201', r.status === 201, `status ${r.status}`);
    r = await call('PUT', `/me/watchlist/${T}`, { body: { listType: 'done' }, cookie: C });
    check('Đổi sang "done" trả 200 (không tạo dòng mới)', r.status === 200 && r.json.data.listType === 'done', `status ${r.status}`);
    await call('PUT', `/me/watchlist/${T2}`, { body: { listType: 'watching' }, cookie: C });
    r = await call('GET', '/me/watchlist', { cookie: C });
    check('Danh sách có đúng 2 tác phẩm kèm thống kê', r.status === 200 && r.json.pagination.total === 2 && r.json.data[0].stats, `status ${r.status} total ${r.json && r.json.pagination && r.json.pagination.total}`);
    r = await call('GET', '/me/watchlist?listType=done', { cookie: C });
    check('Lọc listType=done chỉ trả mục "done"', r.status === 200 && r.json.data.length === 1 && r.json.data[0].listType === 'done', `status ${r.status}`);
    r = await call('GET', '/me/watchlist', { cookie: D });
    check('D không thấy watchlist của C', r.status === 200 && r.json.pagination.total === 0, `total ${r.json && r.json.pagination && r.json.pagination.total}`);
    r = await call('PUT', `/me/watchlist/${T}`, { body: { listType: 'khac' }, cookie: C });
    check('listType sai trả 422', r.status === 422, `status ${r.status}`);
    r = await call('PUT', '/me/watchlist/99999999', { body: { listType: 'want' }, cookie: C });
    check('Tác phẩm không tồn tại trả 404', r.status === 404, `status ${r.status}`);
    const par = await Promise.all([1, 2, 3, 4].map(() => call('PUT', `/me/watchlist/${T}`, { body: { listType: 'want' }, cookie: D })));
    check('4 yêu cầu thêm song song: không lỗi 5xx', par.every((x) => x.status === 200 || x.status === 201), par.map((x) => x.status).join(','));
    r = await call('GET', '/me/watchlist', { cookie: D });
    check('D chỉ có đúng một dòng cho tác phẩm đó', r.status === 200 && r.json.pagination.total === 1, `total ${r.json && r.json.pagination && r.json.pagination.total}`);
    r = await call('DELETE', `/me/watchlist/${T}`, { cookie: C });
    check('Xóa khỏi watchlist trả 200', r.status === 200, `status ${r.status}`);
    r = await call('DELETE', `/me/watchlist/${T}`, { cookie: C });
    check('Xóa lần hai trả 404 WATCHLIST_ITEM_NOT_FOUND', r.status === 404 && code(r) === 'WATCHLIST_ITEM_NOT_FOUND', `status ${r.status}`);

    // ------------------------------------------------------------------
    section('11. Dọn dữ liệu thử');
    await call('DELETE', `/me/watchlist/${T2}`, { cookie: C });
    await call('DELETE', `/me/watchlist/${T}`, { cookie: D });
    r = await call('DELETE', `/titles/${T}/reviews/mine`, { cookie: A });
    check('A xóa bình luận của mình', r.status === 200 || r.status === 404, `status ${r.status}`);
    for (const c of [A]) await call('DELETE', `/titles/${T}/rating`, { cookie: c });
    check('review_count và số lượt chấm về đúng ban đầu', (await reviewCount()) === base && (await detail()).stats.ratingCount === pop.json.data[0].stats.ratingCount, `${await reviewCount()} vs ${base}`);

    console.log(`\nKết quả: ${passed} đạt, ${failed} lỗi`);
    console.log("Dọn tài khoản thử (tùy chọn): DELETE FROM users WHERE email LIKE 'review\\_%' OR email LIKE 'smoke\\_%' OR email LIKE 'load\\_%';");
    process.exit(failed ? 1 : 0);
})().catch((error) => {
    console.error('Không chạy được kiểm thử:', error.message);
    process.exit(1);
});
