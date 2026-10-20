'use strict';
// Giao diện tối thiểu (SPA băm #/). MỌI dữ liệu từ máy chủ được chèn bằng textContent (BM2: chống XSS), không dùng innerHTML.
(() => {
    const $ = (sel) => document.querySelector(sel);
    const main = $('#main');
    let me = null;

    const el = (tag, props = {}, ...kids) => {
        const n = document.createElement(tag);
        for (const [k, v] of Object.entries(props)) {
            if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
            else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null) n.setAttribute(k, v);
        }
        for (const kid of kids.flat()) if (kid !== null && kid !== undefined) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
        return n;
    };
    const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.style.display = 'block'; setTimeout(() => { t.style.display = 'none'; }, 3200); };

    async function api(method, path, body) {
        const opt = { method, headers: {}, credentials: 'same-origin' };
        if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
        const res = await fetch('/api/v1' + path, opt);
        let json = null; try { json = await res.json(); } catch (e) { /* không phải JSON */ }
        if (!res.ok) { const e = new Error((json && json.error && json.error.message) || `Lỗi ${res.status}`); e.status = res.status; e.details = json && json.error && json.error.details; throw e; }
        return json;
    }
    const can = (p) => me && me.permissions && me.permissions.includes(p);
    const isStaff = () => me && me.roles && (me.roles.includes('ADMIN') || me.roles.includes('MODERATOR'));
    const stars = (n) => (n === null || n === undefined ? 'Chưa có' : `${Number(n).toFixed(2)} / 5`);

    // ---------------------------------------------------------------- điều hướng
    function renderNav() {
        const nav = $('#nav'); nav.replaceChildren();
        const cur = location.hash || '#/';
        const link = (href, text) => el('a', { href, text, ...(cur === href ? { 'aria-current': 'page' } : {}) });
        nav.append(link('#/', 'Danh mục'), link('#/ranking', 'Xếp hạng'));
        if (me) nav.append(link('#/watchlist', 'Danh sách theo dõi'), link('#/profile', 'Tài khoản'));
        if (isStaff()) nav.append(link('#/moderation', 'Kiểm duyệt'), link('#/catalog', 'Quản lý danh mục'), link('#/stats', 'Thống kê'));
        if (me && me.roles.includes('ADMIN')) nav.append(link('#/users', 'Người dùng'), link('#/logs', 'Nhật ký'));
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
        formPage('Đăng nhập', [{ id: 'email', label: 'Thư điện tử', type: 'email', ac: 'username' }, { id: 'password', label: 'Mật khẩu', type: 'password', ac: 'current-password' }], 'Đăng nhập', async (v) => {
            await api('POST', '/auth/login', v); await loadMe(); toast('Đăng nhập thành công'); location.hash = '#/'; route();
        });
        main.append(el('p', {}, el('a', { href: '#/forgot', text: 'Quên mật khẩu?' })));
    }
    function pageRegister() {
        formPage('Đăng ký', [{ id: 'fullName', label: 'Họ và tên' }, { id: 'displayName', label: 'Tên hiển thị' }, { id: 'email', label: 'Thư điện tử', type: 'email', ac: 'username' }, { id: 'password', label: 'Mật khẩu (tối thiểu 8 ký tự)', type: 'password', ac: 'new-password', min: 8 }], 'Tạo tài khoản', async (v) => {
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

    async function pageTitle(id) {
        const t = (await api('GET', `/titles/${id}`)).data;
        const wrap = el('div', {});
        wrap.append(el('div', { class: 'card' }, el('h2', { text: t.title }),
            el('p', { class: 'muted', text: `${t.kind === 'movie' ? 'Phim' : 'Sách'} · ${t.releaseYear}` }),
            el('p', { text: t.synopsis || '' }),
            el('p', { text: `Điểm trung bình ${stars(t.stats.ratingAvg)} · ${t.stats.ratingCount} lượt chấm · điểm xếp hạng tin cậy ${t.stats.weightedScore}` })));
        if (t.posterPath) wrap.prepend(el('img', { src: t.posterPath, alt: `Ảnh bìa: ${t.title}`, width: '160', style: 'float:right;margin:0 0 8px 12px;border-radius:6px' }));
        if (t.credits && t.credits.length) wrap.append(el('p', { class: 'muted', text: 'Nhân sự: ' + t.credits.map((c) => `${c.name} (${c.role})`).join(', ') }));
        if (isStaff()) {
            const file = el('input', { id: 'poster', type: 'file', accept: 'image/png,image/jpeg,image/webp' });
            wrap.append(el('div', { class: 'card' }, el('h3', { text: 'Ảnh bìa (MODERATOR, ADMIN)' }), el('label', { for: 'poster', text: 'Chọn ảnh JPG, PNG hoặc WebP, tối đa 2 MB' }), file,
                el('p', {}, el('button', { class: 'primary', text: 'Tải ảnh bìa', onclick: async () => {
                    if (!file.files[0]) { toast('Chưa chọn tệp'); return; }
                    const fd = new FormData(); fd.append('file', file.files[0]);
                    const res = await fetch(`/api/v1/files/titles/${id}/poster`, { method: 'POST', body: fd, credentials: 'same-origin' });
                    const j = await res.json().catch(() => null);
                    if (!res.ok) { toast((j && j.error && j.error.message) || `Lỗi ${res.status}`); return; }
                    toast('Đã tải ảnh bìa'); route();
                } }))));
        }
        if (me) {
            const sel = el('select', { id: 'score' }, [1, 2, 3, 4, 5].map((n) => el('option', { value: n, text: `${n} sao` })));
            const wl = el('select', { id: 'wl' }, el('option', { value: 'want', text: 'Muốn xem/đọc' }), el('option', { value: 'watching', text: 'Đang xem/đọc' }), el('option', { value: 'done', text: 'Đã xem/đọc' }));
            const body = el('textarea', { id: 'body', rows: '3', maxlength: '2000', placeholder: 'Bình luận (tối thiểu 10 ký tự, sẽ được kiểm duyệt)' });
            try { const mine = (await api('GET', `/titles/${id}/rating`)).data; if (mine && mine.score) sel.value = mine.score; } catch (e) { /* chưa chấm */ }
            const act = (fn, okMsg) => async () => { try { await fn(); toast(okMsg); route(); } catch (e) { toast(e.message); } };
            wrap.append(el('div', { class: 'card' }, el('h3', { text: 'Đánh giá của bạn' }),
                el('div', { class: 'row' }, el('div', {}, el('label', { for: 'score', text: 'Điểm' }), sel), el('button', { class: 'primary', text: 'Lưu điểm', onclick: act(() => api('PUT', `/titles/${id}/rating`, { score: Number(sel.value) }), 'Đã lưu điểm') })),
                el('label', { for: 'body', text: 'Bình luận' }), body,
                el('p', {}, el('button', { class: 'primary', text: 'Gửi bình luận', onclick: act(() => api('POST', `/titles/${id}/reviews`, { body: body.value }), 'Đã gửi, đang chờ duyệt') })),
                el('div', { class: 'row' }, el('div', {}, el('label', { for: 'wl', text: 'Danh sách theo dõi' }), wl), el('button', { class: 'primary', text: 'Thêm vào danh sách', onclick: act(() => api('PUT', `/me/watchlist/${id}`, { listType: wl.value }), 'Đã cập nhật danh sách') }))));
        } else wrap.append(el('p', {}, el('a', { href: '#/login', text: 'Đăng nhập' }), ' để chấm điểm và bình luận.'));
        const rv = (await api('GET', `/titles/${id}/reviews?size=20`)).data;
        const list = el('div', { class: 'card' }, el('h3', { text: `Bình luận (${rv.length})` }));
        for (const r of rv) list.append(el('div', { class: 'card' },
            el('p', { class: 'muted', text: `${r.authorName}${r.authorScore ? ' · ' + r.authorScore + ' sao' : ''} · ${r.createdAt}` }),
            el('p', { text: r.body }),   // textContent: chuỗi <script> hiển thị nguyên văn
            me ? el('p', {}, el('button', { class: 'link', text: `Hữu ích (${r.votes.up})`, onclick: async () => { try { await api('PUT', `/reviews/${r.id}/vote`, { vote: 1 }); route(); } catch (e) { toast(e.message); } } }),
                el('button', { class: 'link', text: 'Báo cáo vi phạm', onclick: async () => { try { await api('POST', `/reviews/${r.id}/reports`, { reason: 'spam' }); toast('Đã gửi báo cáo'); } catch (e) { toast(e.message); } } })) : null));
        wrap.append(list);
        main.replaceChildren(wrap);
    }

    async function pageRanking() {
        const r = await api('GET', '/stats/ranking?limit=20');
        const tb = el('tbody', {}); r.data.forEach((x, i) => tb.append(el('tr', {}, el('td', { text: i + 1 }), el('td', {}, el('a', { href: `#/title/${x.id}`, text: x.title })), el('td', { text: x.ratingCount }), el('td', { text: x.ratingAvg ?? '-' }), el('td', { text: x.weightedScore }))));
        main.replaceChildren(el('h2', { text: 'Bảng xếp hạng (điểm có xét độ tin cậy – Bayes)' }), el('p', { class: 'muted', text: 'weighted = (v·R + m·C) / (v + m): tác phẩm ít lượt chấm bị kéo về điểm trung bình toàn hệ thống.' }),
            el('table', {}, el('caption', { class: 'muted', text: 'Top 20' }), el('thead', {}, el('tr', {}, ['#', 'Tác phẩm', 'Lượt chấm', 'Trung bình', 'Điểm xếp hạng'].map((h) => el('th', { scope: 'col', text: h })))), tb));
    }

    async function pageWatchlist() {
        const r = await api('GET', '/me/watchlist'); const rows = r.data || [];
        const box = el('div', {}); if (!rows.length) box.append(el('p', { text: 'Danh sách trống.' }));
        for (const w of rows) box.append(el('div', { class: 'card' }, el('a', { href: `#/title/${w.titleId || w.title_id || w.id}`, text: w.title || `Tác phẩm ${w.titleId || ''}` }), ' ', el('span', { class: 'badge', text: w.listType || w.list_type || '' })));
        main.replaceChildren(el('h2', { text: 'Danh sách theo dõi của tôi' }), box);
    }

    async function pageModeration() {
        const rv = await api('GET', '/moderation/reviews?status=pending&size=20');
        const box = el('div', {}); if (!rv.data.length) box.append(el('p', { text: 'Không có bình luận chờ duyệt.' }));
        for (const r of rv.data) {
            const decide = (action) => async () => { try { await api('POST', `/moderation/reviews/${r.id}/moderate`, { action }); toast('Đã xử lý'); route(); } catch (e) { toast(e.message); } };
            box.append(el('div', { class: 'card' }, el('p', { class: 'muted', text: `#${r.id} · ${r.authorName || r.displayName || ''} · ${r.titleName || r.title || ''}` }), el('p', { text: r.body }),
                el('button', { class: 'primary', text: 'Duyệt', onclick: decide('approve') }), ' ', el('button', { class: 'danger', text: 'Từ chối', onclick: decide('reject') })));
        }
        const rp = await api('GET', '/moderation/reports?status=open&size=20');
        const rbox = el('div', {}); if (!rp.data.length) rbox.append(el('p', { text: 'Không có báo cáo mở.' }));
        for (const x of rp.data) {
            const handle = (decision) => async () => { try { await api('POST', `/moderation/reports/${x.id}/handle`, { decision }); toast('Đã xử lý'); route(); } catch (e) { toast(e.message); } };
            rbox.append(el('div', { class: 'card' }, el('p', { class: 'muted', text: `Báo cáo #${x.id} · lý do: ${x.reason}` }), el('p', { text: x.reviewBody || x.body || '' }),
                el('button', { class: 'danger', text: 'Xác nhận vi phạm', onclick: handle('resolve') }), ' ', el('button', { class: 'primary', text: 'Bác bỏ', onclick: handle('dismiss') })));
        }
        main.replaceChildren(el('h2', { text: 'Hàng đợi bình luận' }), box, el('h2', { text: 'Báo cáo vi phạm' }), rbox);
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


    // ---------------------------------------------------------------- tài khoản
    const errText = (e) => e.message + (e.details && e.details.length ? ' — ' + e.details.map((d) => d.message || d.issue || d.field).join('; ') : '');
    function card(title, fields, submitText, onSubmit, initial = {}) {
        const msg = el('p', { role: 'alert' });
        const inputs = fields.map((f) => el('input', { id: f.id, type: f.type || 'text', autocomplete: f.ac || 'off', value: initial[f.id] || '', ...(f.req === false ? {} : { required: 'required' }) }));
        const node = el('div', { class: 'card' }, el('h3', { text: title }), fields.map((f, i) => [el('label', { for: f.id, text: f.label }), inputs[i]]), msg,
            el('button', { class: 'primary', text: submitText, onclick: async () => {
                msg.className = 'err'; msg.textContent = '';
                try { await onSubmit(Object.fromEntries(fields.map((f, i) => [f.id, inputs[i].value]))); }
                catch (e) { msg.textContent = errText(e); }
            } }));
        return node;
    }
    async function pageProfile() {
        const p = (await api('GET', '/me/profile')).data;
        main.replaceChildren(el('h2', { text: 'Tài khoản của tôi' }),
            el('p', { class: 'muted', text: `${p.email} · vai trò: ${p.roles.join(', ')}` }),
            card('Hồ sơ', [{ id: 'fullName', label: 'Họ và tên' }, { id: 'displayName', label: 'Tên hiển thị' }], 'Lưu hồ sơ', async (v) => { await api('PUT', '/me/profile', v); await loadMe(); renderNav(); toast('Đã lưu hồ sơ'); }, { fullName: p.fullName, displayName: p.displayName }),
            card('Đổi mật khẩu', [{ id: 'currentPassword', label: 'Mật khẩu hiện tại', type: 'password', ac: 'current-password' }, { id: 'newPassword', label: 'Mật khẩu mới (≥ 8 ký tự, có chữ và số)', type: 'password', ac: 'new-password' }], 'Đổi mật khẩu', async (v) => {
                await api('POST', '/auth/change-password', v); me = null; toast('Đã đổi mật khẩu, hãy đăng nhập lại'); location.hash = '#/login'; route();
            }));
    }
    function pageForgot() {
        const out = el('div', {});
        main.replaceChildren(el('h2', { text: 'Quên mật khẩu' }),
            card('Nhận mã đặt lại', [{ id: 'email', label: 'Thư điện tử', type: 'email', ac: 'username' }], 'Gửi mã', async (v) => {
                const r = await api('POST', '/auth/forgot-password', v);
                out.replaceChildren(el('p', { class: 'ok', text: r.message }));
                if (r.data && r.data.simulatedEmail) {
                    const m = r.data.simulatedEmail;
                    out.append(el('div', { class: 'card' }, el('p', { class: 'muted', text: `Thư mô phỏng gửi tới ${m.to} (không có dịch vụ SMTP, mã hiện ngay tại đây; hết hạn sau ${m.expiresInMinutes} phút):` }), el('code', { text: m.resetCode })));
                    out.append(card('Đặt mật khẩu mới', [{ id: 'token', label: 'Mã đặt lại' }, { id: 'newPassword', label: 'Mật khẩu mới', type: 'password', ac: 'new-password' }], 'Đặt lại mật khẩu', async (w) => {
                        await api('POST', '/auth/reset-password', w); toast('Đã đặt lại mật khẩu, hãy đăng nhập'); location.hash = '#/login'; route();
                    }, { token: m.resetCode }));
                }
            }), out);
    }

    // ---------------------------------------------------------------- quản trị người dùng (ADMIN)
    async function pageUsers(qs) {
        const q = new URLSearchParams(qs || ''); const page = Number(q.get('page') || 1);
        q.set('page', String(page)); q.set('size', '10');
        const kw = el('input', { id: 'uq', type: 'search', value: q.get('q') || '', placeholder: 'Email hoặc tên' });
        const st = el('select', { id: 'ust' }, el('option', { value: '', text: 'Mọi trạng thái' }), el('option', { value: 'active', text: 'Hoạt động' }), el('option', { value: 'locked', text: 'Đã khóa' }));
        st.value = q.get('status') || '';
        const go = () => { const p = new URLSearchParams(); if (kw.value.trim()) p.set('q', kw.value.trim()); if (st.value) p.set('status', st.value); location.hash = '#/users?' + p; };
        const r = await api('GET', '/admin/users?' + q);
        const tb = el('tbody', {});
        for (const u of r.data) {
            const role = el('select', { 'aria-label': `Vai trò của ${u.email}` }, ['USER', 'MODERATOR', 'ADMIN'].map((x) => el('option', { value: x, text: x })));
            role.value = u.roles[0] || 'USER';
            const act = (fn, ok) => async () => { try { await fn(); toast(ok); route(); } catch (e) { toast(errText(e)); } };
            const self = me && me.id === u.id;
            tb.append(el('tr', {}, el('td', { text: u.id }), el('td', { text: u.email }), el('td', { text: u.displayName || '' }), el('td', { text: u.status }),
                el('td', {}, role, ' ', el('button', { class: 'link', text: 'Đổi vai trò', onclick: act(() => api('PUT', `/admin/users/${u.id}/role`, { role: role.value }), 'Đã đổi vai trò') })),
                el('td', {}, self ? el('span', { class: 'muted', text: '(bạn)' }) : (u.status === 'locked'
                    ? el('button', { class: 'primary', text: 'Mở khóa', onclick: act(() => api('POST', `/admin/users/${u.id}/unlock`), 'Đã mở khóa') })
                    : el('button', { class: 'danger', text: 'Khóa', onclick: act(() => api('POST', `/admin/users/${u.id}/lock`), 'Đã khóa') })))));
        }
        const base = new URLSearchParams(q); base.delete('size');
        const mk = (pg, label) => { const b = new URLSearchParams(base); b.set('page', pg); return el('a', { href: '#/users?' + b, text: label }); };
        main.replaceChildren(el('h2', { text: 'Quản lý người dùng' }),
            el('div', { class: 'card row' }, el('div', {}, el('label', { for: 'uq', text: 'Tìm' }), kw), el('div', {}, el('label', { for: 'ust', text: 'Trạng thái' }), st), el('button', { class: 'primary', text: 'Lọc', onclick: go })),
            el('table', {}, el('thead', {}, el('tr', {}, ['Mã', 'Email', 'Tên hiển thị', 'Trạng thái', 'Vai trò', 'Thao tác'].map((h) => el('th', { scope: 'col', text: h })))), tb),
            el('div', { class: 'pager' }, page > 1 ? mk(page - 1, '← Trước') : '', el('span', { text: `Trang ${r.pagination.page}/${r.pagination.totalPages} · ${r.pagination.total} tài khoản` }), page < r.pagination.totalPages ? mk(page + 1, 'Sau →') : ''));
    }

    // ---------------------------------------------------------------- quản lý danh mục (MODERATOR, ADMIN)
    async function pageCatalog() {
        const genres = (await api('GET', '/genres')).data || [];
        const kind = el('select', { id: 'tk' }, el('option', { value: 'movie', text: 'Phim' }), el('option', { value: 'book', text: 'Sách' }));
        const f = { title: el('input', { id: 'tt', required: 'required' }), year: el('input', { id: 'ty', type: 'number', min: '1850', max: '2100', required: 'required' }), len: el('input', { id: 'tl', type: 'number', min: '1', required: 'required' }), syn: el('textarea', { id: 'ts', rows: '3' }), pid: el('input', { id: 'tp', type: 'number', min: '1' }), prole: el('select', { id: 'tr' }, ['director', 'author', 'actor', 'writer'].map((x) => el('option', { value: x, text: x }))) };
        const lenLabel = el('label', { for: 'tl', text: 'Thời lượng (phút)' });
        kind.addEventListener('change', () => { lenLabel.textContent = kind.value === 'movie' ? 'Thời lượng (phút)' : 'Số trang'; });
        const gbox = el('div', {}); const checks = [];
        for (const g of genres) { const c = el('input', { type: 'checkbox', id: `g${g.id}`, value: g.id }); checks.push([g, c]); gbox.append(el('label', { for: `g${g.id}`, style: 'display:inline-block;margin-right:12px;font-weight:400' }, c, ' ' + g.name)); }
        const msg = el('p', { role: 'alert' });
        const create = el('div', { class: 'card' }, el('h3', { text: 'Thêm tác phẩm' }),
            el('div', { class: 'row' }, el('div', {}, el('label', { for: 'tk', text: 'Loại' }), kind), el('div', {}, el('label', { for: 'ty', text: 'Năm phát hành' }), f.year), el('div', {}, lenLabel, f.len)),
            el('label', { for: 'tt', text: 'Tên tác phẩm' }), f.title, el('label', { for: 'ts', text: 'Tóm tắt' }), f.syn,
            el('p', { class: 'muted', text: 'Thể loại:' }), gbox,
            el('div', { class: 'row' }, el('div', {}, el('label', { for: 'tp', text: 'Mã nhân vật chính (tùy chọn)' }), f.pid), el('div', {}, el('label', { for: 'tr', text: 'Vai trò' }), f.prole)),
            msg, el('button', { class: 'primary', text: 'Tạo tác phẩm', onclick: async () => {
                msg.className = 'err'; msg.textContent = '';
                const body = { kind: kind.value, title: f.title.value, releaseYear: Number(f.year.value), synopsis: f.syn.value || undefined, status: 'published',
                    genreIds: checks.filter(([g, c]) => c.checked).map(([g]) => g.id), credits: f.pid.value ? [{ personId: Number(f.pid.value), role: f.prole.value, order: 1 }] : [] };
                body[kind.value === 'movie' ? 'runtimeMin' : 'pageCount'] = Number(f.len.value);
                try { const r = await api('POST', '/titles', body); toast('Đã tạo tác phẩm'); location.hash = `#/title/${r.data.id}`; } catch (e) { msg.textContent = errText(e); }
            } }));
        // nhân vật
        const plist = el('div', {});
        const loadPersons = async (qtext) => {
            const r = await api('GET', '/persons?size=10' + (qtext ? '&q=' + encodeURIComponent(qtext) : ''));
            const tb = el('tbody', {}); r.data.forEach((x) => tb.append(el('tr', {}, el('td', { text: x.id }), el('td', { text: x.fullName }), el('td', { text: x.birthYear || '' }), el('td', { text: x.country || '' }))));
            plist.replaceChildren(el('table', {}, el('thead', {}, el('tr', {}, ['Mã', 'Họ tên', 'Năm sinh', 'Quốc gia'].map((h) => el('th', { scope: 'col', text: h })))), tb));
        };
        const ps = el('input', { id: 'psq', type: 'search', placeholder: 'Tìm nhân vật' });
        const persons = el('div', {}, card('Thêm nhân vật', [{ id: 'fullName', label: 'Họ và tên' }, { id: 'birthYear', label: 'Năm sinh', type: 'number', req: false }, { id: 'country', label: 'Quốc gia', req: false }], 'Thêm nhân vật', async (v) => {
            const body = { fullName: v.fullName, birthYear: v.birthYear || null, country: v.country || null };
            await api('POST', '/persons', body); toast('Đã thêm nhân vật'); loadPersons(ps.value.trim());
        }), el('div', { class: 'card' }, el('h3', { text: 'Tra cứu nhân vật' }), el('label', { for: 'psq', text: 'Từ khóa' }), ps, el('p', {}, el('button', { class: 'primary', text: 'Tìm', onclick: () => loadPersons(ps.value.trim()) })), plist));
        const parts = [el('h2', { text: 'Quản lý danh mục' }), create, el('h2', { text: 'Nhân vật' }), persons];
        if (me.roles.includes('ADMIN')) {
            const gtb = el('tbody', {});
            genres.forEach((g) => gtb.append(el('tr', {}, el('td', { text: g.code }), el('td', { text: g.name }), el('td', { text: g.appliesTo }),
                el('td', {}, el('button', { class: 'danger', text: 'Xóa', onclick: async () => { try { await api('DELETE', `/genres/${g.id}`); toast('Đã xóa thể loại'); route(); } catch (e) { toast(errText(e)); } } })))));
            parts.push(el('h2', { text: 'Thể loại (ADMIN)' }),
                card('Thêm thể loại', [{ id: 'code', label: 'Mã (a-z, 0-9, _ -)' }, { id: 'name', label: 'Tên thể loại' }], 'Thêm thể loại', async (v) => { await api('POST', '/genres', { code: v.code, name: v.name, appliesTo: 'both' }); toast('Đã thêm thể loại'); route(); }),
                el('table', {}, el('thead', {}, el('tr', {}, ['Mã', 'Tên', 'Áp dụng', 'Thao tác'].map((h) => el('th', { scope: 'col', text: h })))), gtb));
        }
        main.replaceChildren(...parts); loadPersons('');
    }

    // ---------------------------------------------------------------- định tuyến
    async function route() {
        renderNav();
        const raw = (location.hash || '#/').slice(1); const [path, qs] = raw.split('?'); const parts = path.split('/').filter(Boolean);
        try {
            if (!parts.length) await pageList(qs || '');
            else if (parts[0] === 'login') pageLogin();
            else if (parts[0] === 'register') pageRegister();
            else if (parts[0] === 'title') await pageTitle(Number(parts[1]));
            else if (parts[0] === 'ranking') await pageRanking();
            else if (parts[0] === 'watchlist') await pageWatchlist();
            else if (parts[0] === 'moderation') await pageModeration();
            else if (parts[0] === 'stats') await pageStats();
            else if (parts[0] === 'logs') await pageLogs();
            else if (parts[0] === 'profile') await pageProfile();
            else if (parts[0] === 'forgot') pageForgot();
            else if (parts[0] === 'users') await pageUsers(qs);
            else if (parts[0] === 'catalog') await pageCatalog();
            else main.replaceChildren(el('p', { text: 'Không tìm thấy trang.' }));
            document.title = (main.querySelector('h2') ? main.querySelector('h2').textContent + ' – ' : '') + 'Đánh giá Phim/Sách';
        } catch (e) {
            main.replaceChildren(el('p', { class: 'err', role: 'alert', text: e.status === 401 || e.status === 403 ? 'Bạn cần đăng nhập bằng tài khoản có quyền để xem trang này.' : e.message }));
        }
    }
    window.addEventListener('hashchange', route);
    loadMe().then(route);
})();
