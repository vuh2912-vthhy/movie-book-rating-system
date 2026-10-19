'use strict';
// Giao diện tối thiểu (SPA băm #/). MỌI dữ liệu từ máy chủ được chèn bằng textContent (BM2: chống XSS), không dùng innerHTML.
(() => {
    const $ = (sel) => document.querySelector(sel);
    const main = $('#main');
    let me = null;
    let toastTimer = null;

    const el = (tag, props = {}, ...kids) => {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
            else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null) n.setAttribute(k, v);
        }
        const appendKid = (kid) => {
    if (kid === null || kid === undefined) return;

    if (Array.isArray(kid)) {
        kid.forEach(appendKid);
        return;
    }

    n.append(
        kid.nodeType
            ? kid
            : document.createTextNode(String(kid))
    );
};

kids.forEach(appendKid);
        return n;
    };
    const toast = (msg) => {
        const t = $('#toast');
        t.textContent = msg;
        t.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3200);
    };

    async function api(method, path, body) {
        const opt = { method, headers: {}, credentials: 'same-origin' };
        if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
        const res = await fetch('/api/v1' + path, opt);
        let json = null; try { json = await res.json(); } catch (e) { /* không phải JSON */ }
        if (!res.ok) { const e = new Error((json && json.error && json.error.message) || `Lỗi ${res.status}`); e.status = res.status; e.details = json && json.error && json.error.details; throw e; }
        return json;
    }
    const isStaff = () => me && me.roles && (me.roles.includes('ADMIN') || me.roles.includes('MODERATOR'));
    const stars = (n) => (n === null || n === undefined ? 'Chưa có' : `${Number(n).toFixed(2)} / 5`);

    // ---------------------------------------------------------------- điều hướng
    function renderNav() {
        const nav = $('#nav'); nav.replaceChildren();
        const cur = location.hash || '#/';
        const link = (href, text) => el('a', { href, text, ...(cur === href ? { 'aria-current': 'page' } : {}) });
        nav.append(link('#/', 'Danh mục'), link('#/ranking', 'Xếp hạng'));
        if (me) nav.append(link('#/watchlist', 'Danh sách theo dõi'));
        if (isStaff()) nav.append(link('#/moderation', 'Kiểm duyệt'), link('#/stats', 'Thống kê'));
        if (me && me.roles.includes('ADMIN')) nav.append(link('#/logs', 'Nhật ký'));
        if (me) nav.append(el('span', { class: 'badge', text: `${me.displayName || me.email} (${me.roles.join(', ')})` }), el('button', { text: 'Đăng xuất', onclick: logout }));
        else nav.append(link('#/login', 'Đăng nhập'), link('#/register', 'Đăng ký'));
    }
    async function loadMe() { try { me = (await api('GET', '/auth/me')).data; } catch (e) { me = null; } }
    async function logout() { try { await api('POST', '/auth/logout'); } catch (e) { /* bỏ qua */ } me = null; toast('Đã đăng xuất'); location.hash = '#/'; route(); }

    // ---------------------------------------------------------------- trang
    function formPage(title, fields, submitText, onSubmit) {
        const err = el('p', { class: 'err', role: 'alert' });
        const inputs = fields.map((f) => el('input', { id: f.id, type: f.type || 'text', autocomplete: f.ac || 'off', required: 'required', ...(f.min ? { minlength: f.min } : {}) }));
        const form = el('div', { class: 'card' }, el('h2', { text: title }),
            fields.map((f, i) => [el('label', { for: f.id, text: f.label }), inputs[i]]),
            err, el('button', { class: 'primary', text: submitText, onclick: async () => {
                err.textContent = '';
                try { await onSubmit(Object.fromEntries(fields.map((f, i) => [f.id, inputs[i].value]))); }
                catch (e) { err.textContent = e.message + (e.details && e.details.length ? ' — ' + e.details.map((d) => d.message || d.issue || d.field).join('; ') : ''); }
            } }));
        main.replaceChildren(form);
    }

    function pageLogin() {
        formPage('Đăng nhập', [{ id: 'email', label: 'Email', type: 'email', ac: 'username' }, { id: 'password', label: 'Mật khẩu', type: 'password', ac: 'current-password' }], 'Đăng nhập', async (v) => {
            await api('POST', '/auth/login', v); await loadMe(); toast('Đăng nhập thành công'); location.hash = '#/'; route();
        });
    }
    function pageRegister() {
        formPage('Đăng ký', [{ id: 'fullName', label: 'Họ và tên' }, { id: 'displayName', label: 'Tên hiển thị' }, { id: 'email', label: 'Email', type: 'email', ac: 'username' }, { id: 'password', label: 'Mật khẩu (tối thiểu 8 ký tự)', type: 'password', ac: 'new-password', min: 8 }], 'Tạo tài khoản', async (v) => {
            if (!v.displayName) delete v.displayName;
            await api('POST', '/auth/register', v); toast('Đăng ký thành công, hãy đăng nhập'); location.hash = '#/login'; route();
        });
    }

    async function pageList(params) {
        const q = new URLSearchParams(params); const page = Number(q.get('page') || 1);
        const kw = el('input', { id: 'kw', type: 'search', value: q.get('keyword') || '', placeholder: 'Tên phim/sách (có dấu hoặc không dấu)' });
        const kind = el('select', { id: 'kind' }, el('option', { value: '', text: 'Tất cả' }), el('option', { value: 'movie', text: 'Phim' }), el('option', { value: 'book', text: 'Sách' }));
        kind.value = q.get('kind') || '';
        const go = () => { const p = new URLSearchParams(); if (kw.value.trim()) p.set('keyword', kw.value.trim()); if (kind.value) p.set('kind', kind.value); location.hash = '#/?' + p; };
        const box = el('div', { class: 'grid' }); const pager = el('div', { class: 'pager' });
        main.replaceChildren(el('h2', { text: 'Danh mục phim và sách' }),
            el('div', { class: 'card row' }, el('div', {}, el('label', { for: 'kw', text: 'Tìm kiếm' }), kw), el('div', {}, el('label', { for: 'kind', text: 'Loại' }), kind), el('button', { class: 'primary', text: 'Tìm', onclick: go })),
            box, pager);
        kw.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        q.set('size', '12'); q.set('page', String(page)); q.set('sort', q.get('sort') || 'rating');
        const r = await api('GET', '/titles?' + q);
        if (!r.data.length) box.append(el('p', { text: 'Không có kết quả.' }));
        for (const t of r.data) box.append(el('article', { class: 'card' },
            el('h3', {}, el('a', { href: `#/title/${t.id}`, text: t.title })),
            el('p', { class: 'muted', text: `${t.kind === 'movie' ? 'Phim' : 'Sách'} · ${t.releaseYear}` }),
            el('p', { text: `Điểm: ${stars(t.stats.ratingAvg)} (${t.stats.ratingCount} lượt)` }),
            t.genres.map((g) => el('span', { class: 'badge', text: g.name }))));
        const base = new URLSearchParams(q); base.delete('size');
        const mk = (p, label) => { const b = new URLSearchParams(base); b.set('page', p); return el('a', { href: '#/?' + b, text: label }); };
        pager.append(page > 1 ? mk(page - 1, '← Trước') : '', el('span', { text: `Trang ${r.pagination.page}/${r.pagination.totalPages}` }), page < r.pagination.totalPages ? mk(page + 1, 'Sau →') : '');
    }

    async function pageTitle(id, queryString = '') {
        const query = new URLSearchParams(queryString);
        const commentPage = Math.max(1, Number(query.get('commentPage') || 1));
        const commentPageSize = 10;
        const [titleResponse, reviewsResponse, ratingResponse] = await Promise.all([
            api('GET', `/titles/${id}`),
            api('GET', `/titles/${id}/reviews?size=${commentPageSize}&page=${commentPage}`),
            me ? api('GET', `/titles/${id}/rating`).catch(() => ({ data: null })) : Promise.resolve({ data: null })
        ]);
        const t = titleResponse.data;
        const wrap = el('div', {});
        wrap.append(el('div', { class: 'card' }, el('h2', { text: t.title }),
            el('p', { class: 'muted', text: `${t.kind === 'movie' ? 'Phim' : 'Sách'} · ${t.releaseYear}` }),
            el('p', { text: t.synopsis || '' }),
            el('p', { text: `Điểm trung bình ${stars(t.stats.ratingAvg)} · ${t.stats.ratingCount} lượt chấm · điểm xếp hạng tin cậy ${t.stats.weightedScore}` })));
        if (me) {
            const sel = el('select', { id: 'score' }, [1, 2, 3, 4, 5].map((n) => el('option', { value: n, text: `${n} sao` })));
            const wl = el('select', { id: 'wl' }, el('option', { value: 'want', text: 'Muốn xem/đọc' }), el('option', { value: 'watching', text: 'Đang xem/đọc' }), el('option', { value: 'done', text: 'Đã xem/đọc' }));
            const body = el('textarea', { id: 'body', rows: '3', maxlength: '2000', placeholder: 'Bình luận (tối thiểu 10 ký tự, sẽ được kiểm duyệt)' });
            const mine = ratingResponse.data;
            if (mine && mine.score) sel.value = mine.score;
            const act = (fn, okMsg) => async () => { try { await fn(); toast(okMsg); route(); } catch (e) { toast(e.message); } };
            wrap.append(el('div', { class: 'card' }, el('h3', { text: 'Đánh giá của bạn' }),
                el('div', { class: 'row' }, el('div', {}, el('label', { for: 'score', text: 'Điểm' }), sel), el('button', { class: 'primary', text: 'Lưu điểm', onclick: act(() => api('PUT', `/titles/${id}/rating`, { score: Number(sel.value) }), 'Đã lưu điểm') })),
                el('label', { for: 'body', text: 'Bình luận' }), body,
                el('p', {}, el('button', { class: 'primary', text: 'Gửi bình luận', onclick: act(() => api('POST', `/titles/${id}/reviews`, { body: body.value }), 'Đã gửi, đang chờ duyệt') })),
                el('div', { class: 'row' }, el('div', {}, el('label', { for: 'wl', text: 'Danh sách theo dõi' }), wl), el('button', { class: 'primary', text: 'Thêm vào danh sách', onclick: act(() => api('PUT', `/me/watchlist/${id}`, { listType: wl.value }), 'Đã cập nhật danh sách') }))));
        } else wrap.append(el('p', {}, el('a', { href: '#/login', text: 'Đăng nhập' }), ' để chấm điểm và bình luận.'));
        const rv = reviewsResponse.data || [];
        const commentTotalPages = Math.max(1, Number(reviewsResponse.pagination && reviewsResponse.pagination.totalPages || 1));
        const sort = el('select', { id: 'review-sort', 'aria-label': 'Sắp xếp bình luận' },
            el('option', { value: 'newest', text: 'Mới nhất' }),
            el('option', { value: 'stars', text: 'Số sao cao đến thấp' }));
        const scoreFilter = el('select', { id: 'review-score-filter', 'aria-label': 'Lọc bình luận theo số sao' },
            el('option', { value: '', text: 'Tất cả số sao' }),
            ...[5, 4, 3, 2, 1].map((n) => el('option', { value: n, text: `${n} sao` })));
        sort.value = query.get('commentSort') || 'newest';
        scoreFilter.value = query.get('commentScore') || '';
        const list = el('div', { class: 'card review-list' },
            el('div', { class: 'review-list__header' },
                el('h3', { text: `Bình luận (${rv.length})` }),
                el('div', { class: 'review-controls' },
                    el('div', {}, el('label', { for: 'review-sort', text: 'Sắp xếp' }), sort),
                    el('div', {}, el('label', { for: 'review-score-filter', text: 'Lọc theo sao' }), scoreFilter))));
        const renderReviews = () => {
            list.querySelectorAll('.review-item').forEach((item) => item.remove());
            const selectedScore = scoreFilter.value ? Number(scoreFilter.value) : null;
            const filtered = selectedScore === null
                ? rv
                : rv.filter((review) => Number(review.authorScore) === selectedScore);
            const sorted = [...filtered].sort((a, b) => {
                if (sort.value === 'stars') return Number(b.authorScore || 0) - Number(a.authorScore || 0);
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            });
            list.querySelector('h3').textContent = `Bình luận (${sorted.length})`;
            if (!sorted.length) {
                list.append(el('p', { class: 'muted review-empty', text: 'Không có bình luận phù hợp với bộ lọc này.' }));
                return;
            }
            const fragment = document.createDocumentFragment();
            for (const r of sorted) fragment.append(el('div', { class: 'card review-item' },
                el('p', { class: 'muted review-meta', text: `${r.authorName}${r.authorScore ? ' · ' + r.authorScore + ' sao' : ''} · ${r.createdAt}` }),
                el('p', { class: 'review-body', text: r.body }),   // textContent: chuỗi <script> hiển thị nguyên văn
                me ? el('p', {}, el('button', { class: 'link', text: `Hữu ích (${r.votes.up})`, onclick: async () => { try { await api('PUT', `/reviews/${r.id}/vote`, { vote: 1 }); route(); } catch (e) { toast(e.message); } } }),
                    el('button', { class: 'link', text: 'Báo cáo vi phạm', onclick: async () => { try { await api('POST', `/reviews/${r.id}/reports`, { reason: 'spam' }); toast('Đã gửi báo cáo'); } catch (e) { toast(e.message); } } })) : null));
            list.append(fragment);
        };
        const updateReviewQuery = () => {
            const next = new URLSearchParams(query);
            next.set('commentSort', sort.value);
            if (scoreFilter.value) next.set('commentScore', scoreFilter.value);
            else next.delete('commentScore');
            next.set('commentPage', '1');
            location.hash = `#/title/${id}?${next}`;
        };
        sort.addEventListener('change', updateReviewQuery);
        scoreFilter.addEventListener('change', updateReviewQuery);
        renderReviews();
        const pager = el('div', { class: 'pager', 'aria-label': 'Phân trang bình luận' });
        const makeCommentPageLink = (page, label) => {
            const next = new URLSearchParams(query);
            next.set('commentPage', String(page));
            return el('a', { href: `#/title/${id}?${next}`, text: label });
        };
        if (commentPage > 1) pager.append(makeCommentPageLink(commentPage - 1, '← Trước'));
        pager.append(el('span', { text: `${commentPage}/${commentTotalPages}`, 'aria-label': `Trang ${commentPage} trên ${commentTotalPages}` }));
        if (commentPage < commentTotalPages) pager.append(makeCommentPageLink(commentPage + 1, 'Sau →'));
        wrap.append(list, pager);
        main.replaceChildren(wrap);
    }

    async function pageRanking(queryString = '') {
        const query = new URLSearchParams(queryString);
        const selectedKind = query.get('kind') === 'book' ? 'book' : 'movie';
        const selectedLabel = selectedKind === 'book' ? 'Sách' : 'Phim';
        const r = await api('GET', `/stats/ranking?limit=20&kind=${selectedKind}`);
        const kind = el('select', { id: 'ranking-kind', 'aria-label': 'Chọn loại xếp hạng' },
            el('option', { value: 'movie', text: 'Phim' }),
            el('option', { value: 'book', text: 'Sách' }));
        kind.value = selectedKind;
        kind.addEventListener('change', () => { location.hash = `#/ranking?kind=${kind.value}`; });
        const rankingTable = (title, items) => {
            const tb = el('tbody', {});
            if (!items.length) tb.append(el('tr', {}, el('td', { colspan: '5', class: 'muted', text: 'Chưa có dữ liệu xếp hạng.' })));
            items.forEach((x, i) => tb.append(el('tr', {},
                el('td', { text: i + 1 }),
                el('td', {}, el('a', { href: `#/title/${x.id}`, text: x.title })),
                el('td', { text: x.ratingCount }),
                el('td', { text: x.ratingAvg ?? '-' }),
                el('td', { text: x.weightedScore }))));
            return el('section', { class: 'ranking-section' },
                el('h3', { text: title }),
                el('table', {}, el('caption', { class: 'muted', text: 'Top 20' }),
                    el('thead', {}, el('tr', {}, ['#', 'Tác phẩm', 'Lượt chấm', 'Trung bình', 'Điểm xếp hạng'].map((h) => el('th', { scope: 'col', text: h })))), tb));
        };
        main.replaceChildren(el('h2', { text: 'Bảng xếp hạng' }),
            el('div', { class: 'card ranking-filter' }, el('label', { for: 'ranking-kind', text: 'Xếp hạng theo' }), kind),
            el('p', { class: 'muted', text: 'Điểm xếp hạng có xét độ tin cậy theo công thức Bayes: tác phẩm ít lượt chấm sẽ được điều chỉnh về điểm trung bình toàn hệ thống.' }),
            rankingTable(selectedLabel, r.data || []));
    }

    async function pageWatchlist() {
        const r = await api('GET', '/me/watchlist'); const rows = r.data || [];
        const box = el('div', {}); if (!rows.length) box.append(el('p', { text: 'Danh sách trống.' }));
        for (const w of rows) box.append(el('div', { class: 'card' }, el('a', { href: `#/title/${w.titleId || w.title_id || w.id}`, text: w.title || `Tác phẩm ${w.titleId || ''}` }), ' ', el('span', { class: 'badge', text: w.listType || w.list_type || '' })));
        main.replaceChildren(el('h2', { text: 'Danh sách theo dõi của tôi' }), box);
    }

    async function pageModeration(queryString = '') {
        const q = new URLSearchParams(queryString);
        const reviewPage = Math.max(1, Number(q.get('reviewPage') || 1));
        const reportPage = Math.max(1, Number(q.get('reportPage') || 1));
        const pageSize = 10;
        const rv = await api('GET', `/moderation/reviews?status=pending&size=${pageSize}&page=${reviewPage}`);
        const box = el('div', {}); if (!rv.data.length) box.append(el('p', { text: 'Không có bình luận chờ duyệt.' }));
        for (const r of rv.data) {
            const decide = (action) => async () => { try { await api('POST', `/moderation/reviews/${r.id}/moderate`, { action }); toast('Đã xử lý'); route(); } catch (e) { toast(e.message); } };
            box.append(el('div', { class: 'card' }, el('p', { class: 'muted', text: `#${r.id} · ${r.authorName || r.displayName || ''} · ${r.titleName || r.title || ''}` }), el('p', { text: r.body }),
                el('button', { class: 'primary', text: 'Duyệt', onclick: decide('approve') }), ' ', el('button', { class: 'danger', text: 'Từ chối', onclick: decide('reject') })));
        }
        const reviewTotalPages = Math.max(1, Number(rv.pagination && rv.pagination.totalPages || 1));
        const makePager = (currentPage, totalPages, pageKey) => {
            const pager = el('div', { class: 'pager', 'aria-label': 'Phân trang' });
            const makeLink = (page, label) => {
                const next = new URLSearchParams(location.hash.split('?')[1] || '');
                next.set(pageKey, String(page));
                return el('a', { href: '#/moderation?' + next, text: label });
            };
            if (currentPage > 1) pager.append(makeLink(currentPage - 1, '← Trước'));
            pager.append(el('span', { text: `${currentPage}/${totalPages}`, 'aria-label': `Trang ${currentPage} trên ${totalPages}` }));
            if (currentPage < totalPages) pager.append(makeLink(currentPage + 1, 'Sau →'));
            return pager;
        };
        const rp = await api('GET', `/moderation/reports?status=open&size=${pageSize}&page=${reportPage}`);
        const rbox = el('div', {}); if (!rp.data.length) rbox.append(el('p', { text: 'Không có báo cáo mở.' }));
        for (const x of rp.data) {
            const handle = (decision) => async () => { try { await api('POST', `/moderation/reports/${x.id}/handle`, { decision }); toast('Đã xử lý'); route(); } catch (e) { toast(e.message); } };
            rbox.append(el('div', { class: 'card' }, el('p', { class: 'muted', text: `Báo cáo #${x.id} · lý do: ${x.reason}` }), el('p', { text: x.reviewBody || x.body || '' }),
                el('button', { class: 'danger', text: 'Xác nhận vi phạm', onclick: handle('resolve') }), ' ', el('button', { class: 'primary', text: 'Bác bỏ', onclick: handle('dismiss') })));
        }
        const reportTotalPages = Math.max(1, Number(rp.pagination && rp.pagination.totalPages || 1));
        main.replaceChildren(
            el('h2', { text: 'Hàng đợi bình luận' }),
            box,
            makePager(reviewPage, reviewTotalPages, 'reviewPage'),
            el('h2', { text: 'Báo cáo vi phạm' }),
            rbox,
            makePager(reportPage, reportTotalPages, 'reportPage')
        );
    }

    async function pageStats() {
        const g = (await api('GET', '/stats/genres')).data;
        const items = Array.isArray(g) ? g : [];
        const canvas = el('canvas', { id: 'chart', role: 'img', 'aria-label': 'Biểu đồ số lượt chấm theo thể loại' });
        const tb = el('tbody', {}); items.forEach((x) => tb.append(el('tr', {}, el('td', { text: x.name }), el('td', { text: x.titleCount }), el('td', { text: x.ratingCount }), el('td', { text: x.ratingAvg ?? '-' }))));
        main.replaceChildren(el('h2', { text: 'Thống kê theo thể loại' }), canvas,
            el('table', {}, el('caption', { class: 'muted', text: 'Dữ liệu của biểu đồ' }), el('thead', {}, el('tr', {}, ['Thể loại', 'Số tác phẩm', 'Lượt chấm', 'Điểm TB'].map((h) => el('th', { scope: 'col', text: h })))), tb),
            el('p', {}, el('a', { href: '/api/v1/stats/export?format=csv', text: 'Xuất CSV' }), ' · ', el('a', { href: '/api/v1/stats/export?format=xlsx', text: 'Xuất Excel' }), el('span', { class: 'muted', text: ' (chỉ ADMIN)' })));
        if (window.Chart) new window.Chart(canvas, { type: 'bar', data: { labels: items.map((x) => x.name), datasets: [{ label: 'Lượt chấm', data: items.map((x) => x.ratingCount), backgroundColor: '#1f3a5f' }] }, options: { responsive: true } });
    }

    async function pageLogs() {
        const r = await api('GET', '/admin/system-logs?size=30');
        const tb = el('tbody', {}); r.data.forEach((x) => tb.append(el('tr', {}, el('td', { text: x.createdAt }), el('td', { text: x.userName || x.userId || '-' }), el('td', { text: x.action }), el('td', { text: `${x.entity || ''} ${x.entityId || ''}` }), el('td', { text: x.ip || '' }))));
        main.replaceChildren(el('h2', { text: 'Nhật ký hệ thống' }), el('table', {}, el('thead', {}, el('tr', {}, ['Thời điểm', 'Người dùng', 'Hành động', 'Đối tượng', 'IP'].map((h) => el('th', { scope: 'col', text: h })))), tb));
    }

    // ---------------------------------------------------------------- định tuyến
    async function route() {
        renderNav();
        const raw = (location.hash || '#/').slice(1); const [path, qs] = raw.split('?'); const parts = path.split('/').filter(Boolean);
        try {
            if (!parts.length) await pageList(qs || '');
            else if (parts[0] === 'login') pageLogin();
            else if (parts[0] === 'register') pageRegister();
            else if (parts[0] === 'title') await pageTitle(Number(parts[1]), qs || '');
            else if (parts[0] === 'ranking') await pageRanking(qs || '');
            else if (parts[0] === 'watchlist') await pageWatchlist();
            else if (parts[0] === 'moderation') await pageModeration(qs || '');
            else if (parts[0] === 'stats') await pageStats();
            else if (parts[0] === 'logs') await pageLogs();
            else main.replaceChildren(el('p', { text: 'Không tìm thấy trang.' }));
            document.title = (main.querySelector('h2') ? main.querySelector('h2').textContent + ' – ' : '') + 'Đánh giá Phim/Sách';
        } catch (e) {
            main.replaceChildren(el('p', { class: 'err', role: 'alert', text: e.status === 401 || e.status === 403 ? 'Bạn cần đăng nhập bằng tài khoản có quyền để xem trang này.' : e.message }));
        }
    }
    window.addEventListener('hashchange', route);
    loadMe().then(route);
})();
