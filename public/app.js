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
        for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
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
    const REPORT_REASONS = [
        'spam',
        'offensive',
        'spoiler',
        'off_topic',
        'other'
    ];
    const REPORT_REASON_LABELS = {
        spam: 'Spam',
        offensive: 'Nội dung xúc phạm',
        spoiler: 'Spoiler',
        off_topic: 'Không liên quan',
        other: 'Khác'
    };
    const reportReasonLabel = (reason) => REPORT_REASON_LABELS[reason] || 'Khác';
    const titleCover = (title, kind, posterPath, className) => {
        if (posterPath) return el('img', { class: className, src: posterPath, alt: `Ảnh bìa: ${title}`, loading: 'lazy' });
        const isMovie = kind === 'movie';
        const monogram = String(title || '').trim().slice(0, 1).toLocaleUpperCase('vi-VN') || 'Đ';
        return el('div', { class: `${className} cover-fallback`, role: 'img', 'data-kind': kind, 'aria-label': `Ảnh minh họa ${isMovie ? 'phim' : 'sách'}: ${title}` },
            el('span', { class: 'cover-kind', text: isMovie ? 'PHIM' : 'SÁCH' }),
            el('strong', { class: 'cover-monogram', text: monogram }),
            el('span', { class: 'cover-detail', text: isMovie ? 'KHUNG HÌNH' : 'TRANG SÁCH' }));
    };
    const responsiveTable = (table) => el('div', { class: 'table-wrap' }, table);

    // ---------------------------------------------------------------- điều hướng
    function renderNav() {
        const nav = $('#nav'); nav.replaceChildren();
        const cur = (location.hash || '#/').split('?')[0];
        const link = (href, text, className) => el('a', { href, text, ...(className ? { class: className } : {}), ...(cur === href ? { 'aria-current': 'page' } : {}) });
        const items = [link('#/', 'Danh mục'), link('#/ranking', 'Xếp hạng')];
        if (me) items.push(link('#/watchlist', 'Danh sách theo dõi'), link('#/my-reviews', 'Bình luận của tôi'), link('#/notifications', 'Thông báo'), link('#/profile', 'Tài khoản'));
        if (isStaff()) items.push(link('#/moderation', 'Kiểm duyệt'), link('#/catalog', 'Quản lý danh mục'), link('#/stats', 'Thống kê'));
        if (me && me.roles.includes('ADMIN')) items.push(link('#/users', 'Người dùng'), link('#/logs', 'Nhật ký'));
        if (me) items.push(
            el('span', { class: 'badge nav-user-badge', text: `${me.displayName || me.email} (${me.roles.join(', ')})` }),
            el('button', { class: 'nav-logout', type: 'button', text: 'Đăng xuất', onclick: logout })
        );

        const menu = el('div', { id: 'nav-menu', class: 'nav-menu', hidden: 'hidden' },
            el('ul', { class: 'nav-menu-list' }, items.map((item) => el('li', {}, item))));
        const toggle = el('button', {
            class: 'nav-menu-toggle', type: 'button', 'aria-controls': 'nav-menu', 'aria-expanded': 'false',
            'aria-label': 'Mở danh sách điều hướng'
        }, el('span', { class: 'nav-menu-icon', 'aria-hidden': 'true' }), el('span', { class: 'nav-menu-label', text: 'Danh sách' }));
        const actions = el('div', { class: 'nav-actions' }, toggle);
        if (!me) actions.append(link('#/login', 'Đăng nhập', 'nav-auth-link'), link('#/register', 'Đăng ký', 'nav-auth-link'));

        const setMenuOpen = (open) => {
            menu.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Đóng danh sách điều hướng' : 'Mở danh sách điều hướng');
            nav.classList.toggle('nav-open', open);
        };
        toggle.addEventListener('click', () => setMenuOpen(menu.hidden));
        menu.addEventListener('click', (event) => {
            if (event.target.closest('a, button')) setMenuOpen(false);
        });
        nav.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !menu.hidden) {
                setMenuOpen(false);
                toggle.focus();
            }
        });
        nav.append(actions, menu);
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
        const q = new URLSearchParams(params); const page = Math.max(1, Number.parseInt(q.get('page') || '1', 10) || 1);
        const kw = el('input', { id: 'kw', type: 'search', value: q.get('keyword') || '', placeholder: 'Tìm theo tên phim hoặc sách', maxlength: '100' });
        const kind = el('select', { id: 'kind' }, el('option', { value: '', text: 'Phim và sách' }), el('option', { value: 'movie', text: 'Chỉ phim' }), el('option', { value: 'book', text: 'Chỉ sách' }));
        kind.value = q.get('kind') || '';
        // Lấy thể loại động từ API, không hard-code danh sách trong giao diện.
        let genres = [];
        try { genres = (await api('GET', '/genres')).data || []; }
        catch (e) { toast('Không tải được danh sách thể loại: ' + errText(e)); }
        const genre = el('select', { id: 'genre' },
            el('option', { value: '', text: 'Tất cả thể loại' }),
            genres.filter((g) => !g.appliesTo || g.appliesTo === 'both' || !kind.value || g.appliesTo === kind.value || (kind.value === 'movie' && g.appliesTo === 'movie') || (kind.value === 'book' && g.appliesTo === 'book'))
                .map((g) => el('option', { value: g.code, text: g.name })));
        genre.value = q.get('genre') || '';
        const refreshGenreOptions = () => {
            const selected = genre.value;
            genre.replaceChildren(el('option', { value: '', text: 'Tất cả thể loại' }),
                ...genres.filter((g) => !g.appliesTo || g.appliesTo === 'both' || !kind.value || g.appliesTo === kind.value)
                    .map((g) => el('option', { value: g.code, text: g.name })));
            if ([...genre.options].some((o) => o.value === selected)) genre.value = selected;
            else genre.value = '';
        };
        const go = () => {
            const p = new URLSearchParams();
            if (kw.value.trim()) p.set('keyword', kw.value.trim());
            if (kind.value) p.set('kind', kind.value);
            if (genre.value) p.set('genre', genre.value);
            const sort = q.get('sort'); if (sort) p.set('sort', sort);
            p.set('page', '1');
            location.hash = '#/?' + p;
        };
        kind.addEventListener('change', refreshGenreOptions);
        const box = el('div', { class: 'grid' }); const pager = el('div', { class: 'pager' });
        const intro = el('section', { class: 'catalog-hero' },
            el('p', { class: 'catalog-kicker', text: 'KHUNG HÌNH · TRANG SÁCH · GÓC NHÌN CỘNG ĐỒNG' }),
            el('h2', { text: 'Danh mục phim và sách' }),
            el('p', { class: 'catalog-description', text: 'Gặp những câu chuyện đáng nhớ — từ màn ảnh rộng đến trang sách, qua cảm nhận của cộng đồng.' }));
        const filters = el('div', { class: 'card row catalog-filter' },
            el('div', {}, el('label', { for: 'kw', text: 'Từ khóa' }), kw),
            el('div', {}, el('label', { for: 'kind', text: 'Loại tác phẩm' }), kind),
            el('div', {}, el('label', { for: 'genre', text: 'Thể loại' }), genre),
            el('button', { class: 'primary', text: 'Tìm tác phẩm', onclick: go }),
            el('button', { class: 'secondary', text: 'Xóa bộ lọc', onclick: () => { location.hash = '#/'; } }));
        main.replaceChildren(intro, filters, box, pager);
        kw.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        genre.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        q.set('size', '12'); q.set('page', String(page)); q.set('sort', q.get('sort') || 'rating');
        const r = await api('GET', '/titles?' + q);
        if (!r.data.length) box.append(el('p', { text: 'Không có kết quả.' }));
        for (const t of r.data) {
            const kindLabel = t.kind === 'movie' ? 'Phim' : 'Sách';
            box.append(el('article', { class: 'card title-card', 'data-kind': t.kind },
                titleCover(t.title, t.kind, t.posterPath, 'catalog-cover'),
                el('div', { class: 'title-card-content' },
                    el('p', { class: 'title-card-meta', text: `${kindLabel} · ${t.releaseYear}` }),
                    el('h3', {}, el('a', { href: `#/title/${t.id}`, text: t.title })),
                    el('p', { class: 'rating-line', text: `★ ${stars(t.stats.ratingAvg)} · ${t.stats.ratingCount} lượt chấm` }),
                    el('div', { class: 'genre-list' }, t.genres.map((g) => el('a', { class: 'badge genre-filter-link', href: `#/?genre=${encodeURIComponent(g.code || '')}`, text: g.name, title: `Tìm tác phẩm thể loại ${g.name}` }))))));
        }
        const base = new URLSearchParams(q); base.delete('size');
        const mk = (p, label) => { const b = new URLSearchParams(base); b.set('page', p); return el('a', { href: '#/?' + b, text: label }); };
        pager.append(page > 1 ? mk(page - 1, '← Trước') : '', el('span', { text: `Trang ${r.pagination.page}/${r.pagination.totalPages}` }), page < r.pagination.totalPages ? mk(page + 1, 'Sau →') : '');
    }

    async function pageTitle(id, queryString) {
        const query = new URLSearchParams(queryString || '');
        const requestedPage = Math.max(1, Number.parseInt(query.get('page') || '1', 10) || 1);
        const selectedSort = ['latest', 'rating_desc'].includes(query.get('sort')) ? query.get('sort') : 'latest';
        const selectedRating = ['1', '2', '3', '4', '5'].includes(query.get('rating')) ? query.get('rating') : '';
        const t = (await api('GET', `/titles/${id}`)).data;
        const wrap = el('div', { class: 'title-page' });
        const isMovie = t.kind === 'movie';
        const summary = el('div', { class: 'card title-summary' },
            el('p', { class: 'title-kicker', text: `${isMovie ? 'PHIM' : 'SÁCH'} · ${t.releaseYear}` }),
            el('h2', { text: t.title }),
            el('p', { class: 'title-synopsis', text: t.synopsis || '' }),
            el('p', { class: 'title-scoreline', text: `★ ${stars(t.stats.ratingAvg)} · ${t.stats.ratingCount} lượt chấm` }),
            el('p', { class: 'title-weighted-score', text: `Điểm xếp hạng tin cậy ${t.stats.weightedScore}` }));
        if (t.credits && t.credits.length) summary.append(el('p', { class: 'muted title-credits', text: 'Nhân sự: ' + t.credits.map((c) => `${c.name} (${c.role})`).join(', ') }));
        const hero = el('section', { class: 'title-hero' }, titleCover(t.title, t.kind, t.posterPath, 'detail-cover'), summary);
        wrap.append(hero);
        if (can('title.update')) {
            const genres = (await api('GET', '/genres')).data || [];
            const editTitle = el('input', { id: 'edit-title-name', value: t.title || '' });
            const editOriginal = el('input', { id: 'edit-title-original', value: t.originalTitle || '' });
            const editYear = el('input', { id: 'edit-title-year', type: 'number', min: '1850', max: '2100', value: t.releaseYear || '' });
            const editLength = el('input', { id: 'edit-title-length', type: 'number', min: '1', value: isMovie ? (t.runtimeMin || '') : (t.pageCount || '') });
            const editSynopsis = el('textarea', { id: 'edit-title-synopsis', rows: '4' }); editSynopsis.value = t.synopsis || '';
            const editStatus = el('select', { id: 'edit-title-status' }, ['draft','published','hidden'].map((x) => el('option', { value: x, text: ({draft:'Bản nháp',published:'Đã công bố',hidden:'Đã ẩn'})[x] }))); editStatus.value = t.status || 'published';
            const genreBox = el('div', { class: 'genre-edit-list' }); const selectedGenreKeys = new Set((t.genres || []).flatMap((g) => [String(g.id ?? ''), String(g.code ?? ''), String(g.name ?? '')]));
            const genreChecks = [];
            for (const g of genres) { const c = el('input', { type: 'checkbox', id: `edit-g-${g.id}`, value: g.id }); c.checked = selectedGenreKeys.has(String(g.id)) || selectedGenreKeys.has(String(g.code)) || selectedGenreKeys.has(String(g.name)); genreChecks.push([g,c]); genreBox.append(el('label', { for: `edit-g-${g.id}`, class: 'genre-edit-option' }, c, ' ', g.name)); }
            wrap.append(el('div', { class: 'card title-edit-card' }, el('h3', { text: 'Chỉnh sửa thông tin tác phẩm' }), el('div', { class: 'row' }, el('div', {}, el('label', { for: 'edit-title-name', text: 'Tên tác phẩm' }), editTitle), el('div', {}, el('label', { for: 'edit-title-original', text: 'Tên gốc' }), editOriginal), el('div', {}, el('label', { for: 'edit-title-year', text: 'Năm phát hành' }), editYear), el('div', {}, el('label', { for: 'edit-title-length', text: isMovie ? 'Thời lượng (phút)' : 'Số trang' }), editLength)), el('label', { for: 'edit-title-synopsis', text: 'Tóm tắt' }), editSynopsis, el('label', { for: 'edit-title-status', text: 'Trạng thái' }), editStatus, el('p', { class: 'muted', text: 'Thể loại (chọn ít nhất một, tối đa năm)' }), genreBox, el('button', { class: 'primary', text: 'Lưu thông tin', onclick: async () => { try { const ids = genreChecks.filter(([,c]) => c.checked).map(([g]) => Number(g.id)); if (!ids.length || ids.length > 5) throw new Error('Chọn từ 1 đến 5 thể loại.'); const payload = { kind: t.kind, title: editTitle.value.trim(), originalTitle: editOriginal.value.trim() || null, releaseYear: Number(editYear.value), synopsis: editSynopsis.value, status: editStatus.value, genreIds: ids, credits: (t.credits || []).map((c,i) => ({ personId: Number(c.personId || c.person_id || c.id), role: c.role, order: c.order || i+1 })).filter((c) => c.personId) }; payload[isMovie ? 'runtimeMin' : 'pageCount'] = Number(editLength.value); await api('PUT', `/titles/${id}`, payload); toast('Đã cập nhật tác phẩm'); route(); } catch (e) { toast(errText(e)); } } }), can('title.delete') ? el('button', { class: 'danger', text: 'Ẩn tác phẩm', onclick: async () => { if (!confirm('Ẩn tác phẩm này? Tác phẩm sẽ không còn hiển thị công khai.')) return; try { await api('DELETE', `/titles/${id}`); toast('Đã ẩn tác phẩm'); location.hash = '#/'; route(); } catch (e) { toast(errText(e)); } } }) : null));
        }
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
            wrap.append(el('div', { class: 'card rating-card' }, el('h3', { text: 'Đánh giá của bạn' }),
                el('div', { class: 'row' }, el('div', {}, el('label', { for: 'score', text: 'Điểm' }), sel), el('button', { class: 'primary', text: 'Lưu điểm', onclick: act(() => api('PUT', `/titles/${id}/rating`, { score: Number(sel.value) }), 'Đã lưu điểm') })),
            el('label', { for: 'body', text: 'Bình luận' }), body,
            el('p', {}, el('button', { class: 'primary', text: 'Gửi bình luận', onclick: act(() => api('POST', `/titles/${id}/reviews`, { body: body.value }), 'Đã gửi, đang chờ duyệt') })),
            el('div', { class: 'row' }, el('div', {}, el('label', { for: 'wl', text: 'Danh sách theo dõi' }), wl), el('button', { class: 'primary', text: 'Thêm vào danh sách', onclick: act(() => api('PUT', `/me/watchlist/${id}`, { listType: wl.value }), 'Đã cập nhật danh sách') }))));
            if (can('rating.delete_own')) wrap.append(el('div', { class: 'card' }, el('h3', { text: 'Quản lý điểm của bạn' }), el('p', { class: 'muted', text: 'Bạn có thể xóa điểm đã chấm cho tác phẩm này.' }), el('button', { class: 'danger', text: 'Xóa điểm đánh giá', onclick: async () => { if (!confirm('Xóa điểm đánh giá của bạn?')) return; try { await api('DELETE', `/titles/${id}/rating`); toast('Đã xóa điểm'); route(); } catch (e) { toast(errText(e)); } } })));
        } else wrap.append(el('p', {}, el('a', { href: '#/login', text: 'Đăng nhập' }), ' để chấm điểm và bình luận.'));
        const reviewResponse = await api('GET', `/titles/${id}/reviews?size=20`);
        const fetchedReviews = Array.isArray(reviewResponse.data) ? [...reviewResponse.data] : [];
        const filteredReviews = selectedRating
            ? fetchedReviews.filter((r) => Number(r.authorScore) === Number(selectedRating))
            : fetchedReviews;
        filteredReviews.sort((a, b) => {
            if (selectedSort === 'rating_desc') return Number(b.authorScore || 0) - Number(a.authorScore || 0);
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        });
        const reviewTotal = filteredReviews.length;
        const totalPages = Math.max(1, Math.ceil(reviewTotal / 10));
        const currentPage = Math.min(requestedPage, totalPages);
        const rows = filteredReviews.slice((currentPage - 1) * 10, currentPage * 10);
        const controls = el('div', { class: 'card review-tools' });
        const sortSelect = el('select', { id: 'reviewSort', 'aria-label': 'Sắp xếp bình luận' },
            el('option', { value: 'latest', text: 'Mới nhất' }),
            el('option', { value: 'rating_desc', text: 'Số sao cao đến thấp' }));
        sortSelect.value = selectedSort;
        const ratingSelect = el('select', { id: 'reviewRating', 'aria-label': 'Lọc bình luận theo số sao' },
            el('option', { value: '', text: 'Tất cả số sao' }),
            [5, 4, 3, 2, 1].map((n) => el('option', { value: n, text: `${n} sao` })));
        ratingSelect.value = selectedRating;
        const updateReviewQuery = (key, value) => {
            const next = new URLSearchParams(query);
            next.set('page', '1');
            if (value) next.set(key, value); else next.delete(key);
            location.hash = `#/title/${id}?${next}`;
        };
        sortSelect.addEventListener('change', () => updateReviewQuery('sort', sortSelect.value));
        ratingSelect.addEventListener('change', () => updateReviewQuery('rating', ratingSelect.value));
        controls.append(
            el('div', {}, el('label', { for: 'reviewSort', text: 'Sắp xếp' }), sortSelect),
            el('div', {}, el('label', { for: 'reviewRating', text: 'Lọc theo điểm' }), ratingSelect));
        const list = el('div', { class: 'card review-list', 'aria-label': 'Danh sách bình luận' },
            el('h3', { text: `Bình luận (${reviewTotal})` }));
        if (!rows.length) list.append(el('p', { class: 'muted', text: 'Chưa có bình luận phù hợp với bộ lọc.' }));
        for (const r of rows) {
            const voteCount = r.votes && r.votes.up !== undefined ? r.votes.up : 0;
            const reviewCard = el('div', { class: 'card review-card' },
                el('p', { class: 'muted', text: `${r.authorName || 'Người dùng'}${r.authorScore !== null && r.authorScore !== undefined ? ' · ' + r.authorScore + ' sao' : ''}${r.createdAt ? ' · ' + r.createdAt : ''}` }),
                el('p', { class: 'review-body', text: r.body || '' })); // textContent: nội dung HTML hiển thị nguyên văn
            if (me) {
                const reasonId = `report-reason-${r.id}`;
                const reasonSelect = el('select', { id: reasonId, required: 'required' },
                    el('option', { value: '', text: 'Chọn lý do báo cáo', disabled: 'disabled', selected: 'selected' }),
                    REPORT_REASONS.map((reason) => el('option', { value: reason, text: REPORT_REASON_LABELS[reason] })));
                const reportMessage = el('p', { class: 'err', role: 'alert' });
                const reportForm = el('form', { class: 'report-form', hidden: 'hidden' },
                    el('label', { for: reasonId, text: 'Lý do báo cáo' }), reasonSelect,
                    reportMessage,
                    el('button', { class: 'primary', type: 'submit', text: 'Gửi báo cáo' }));
                reportForm.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    reportMessage.textContent = '';
                    if (!REPORT_REASONS.includes(reasonSelect.value)) {
                        reportMessage.textContent = 'Vui lòng chọn một lý do báo cáo.';
                        return;
                    }
                    try {
                        await api('POST', `/reviews/${r.id}/reports`, { reason: reasonSelect.value });
                        toast('Đã gửi báo cáo');
                        reportForm.hidden = true;
                        reasonSelect.value = '';
                    } catch (e) { reportMessage.textContent = e.message; }
                });
                reviewCard.append(el('div', { class: 'review-actions' },
                    el('button', { class: 'link', type: 'button', text: r.myVote === 1 ? `Đã bình chọn hữu ích (${voteCount}) · Bỏ phiếu` : `Hữu ích (${voteCount})`, onclick: async () => { try { if (r.myVote === 1) await api('DELETE', `/reviews/${r.id}/vote`); else await api('PUT', `/reviews/${r.id}/vote`, { vote: 1 }); route(); } catch (e) { toast(e.message); } } }),
                    el('button', { class: 'link', type: 'button', text: 'Báo cáo vi phạm', onclick: () => { reportForm.hidden = !reportForm.hidden; } }),
                    reportForm));
            }
            list.append(reviewCard);
        }
        const reviewPageLink = (pageNumber, label) => {
            const next = new URLSearchParams(query);
            next.set('page', String(pageNumber));
            return el('a', { href: `#/title/${id}?${next}`, text: label });
        };
        const reviewPager = el('div', { class: 'pager', 'aria-label': 'Phân trang bình luận' },
            currentPage > 1 ? reviewPageLink(currentPage - 1, '← Trước') : null,
            el('span', { text: `Trang ${currentPage}/${totalPages}` }),
            currentPage < totalPages ? reviewPageLink(currentPage + 1, 'Sau →') : null);
        wrap.append(controls, list, reviewPager);
        main.replaceChildren(wrap);
    }

    async function pageRanking(queryString) {
        const query = new URLSearchParams(queryString || '');
        const selectedKind = query.get('kind') === 'book' ? 'book' : 'movie';
        const r = await api('GET', `/stats/ranking?limit=20&kind=${selectedKind}`);
        const tb = el('tbody', {}); r.data.forEach((x, i) => tb.append(el('tr', {}, el('td', { text: i + 1 }), el('td', {}, el('a', { href: `#/title/${x.id}`, text: x.title })), el('td', { text: x.ratingCount }), el('td', { text: x.ratingAvg ?? '-' }), el('td', { text: x.weightedScore }))));
        const kindSelect = el('select', { id: 'rankingKind', 'aria-label': 'Loại tác phẩm xếp hạng' },
            el('option', { value: 'movie', text: 'Phim' }), el('option', { value: 'book', text: 'Sách' }));
        kindSelect.value = selectedKind;
        kindSelect.addEventListener('change', () => { location.hash = `#/ranking?kind=${kindSelect.value}`; });
        main.replaceChildren(el('h2', { text: 'Bảng xếp hạng điểm Bayes' }),
            el('p', { class: 'muted', text: 'weighted = (v·R + m·C) / (v + m): tác phẩm ít lượt chấm bị kéo về điểm trung bình toàn hệ thống.' }),
            el('div', { class: 'card ranking-filter' }, el('label', { for: 'rankingKind', text: 'Xếp hạng theo loại' }), kindSelect),
            responsiveTable(el('table', {}, el('caption', { class: 'muted', text: `Top 20 · ${selectedKind === 'movie' ? 'Phim' : 'Sách'}` }), el('thead', {}, el('tr', {}, ['#', 'Tác phẩm', 'Lượt chấm', 'Trung bình', 'Điểm xếp hạng'].map((h) => el('th', { scope: 'col', text: h })))), tb)));
    }

    async function pageWatchlist() {
        const r = await api('GET', '/me/watchlist'); const rows = r.data || [];
        const box = el('div', {}); if (!rows.length) box.append(el('p', { text: 'Danh sách trống.' }));
        for (const w of rows) { const tid = w.titleId || w.title_id || w.id; box.append(el('div', { class: 'card watchlist-item' }, el('div', {}, el('a', { href: `#/title/${tid}`, text: w.title || `Tác phẩm ${tid}` }), ' ', el('span', { class: 'badge', text: w.listType || w.list_type || '' })), el('button', { class: 'danger', text: 'Bỏ khỏi danh sách', onclick: async () => { if (!confirm('Bỏ tác phẩm này khỏi danh sách theo dõi?')) return; try { await api('DELETE', `/me/watchlist/${tid}`); toast('Đã bỏ khỏi danh sách'); route(); } catch (e) { toast(errText(e)); } } }))); }
        main.replaceChildren(el('h2', { text: 'Danh sách theo dõi của tôi' }), box);
    }

    async function pageModeration(queryString) {
        const query = new URLSearchParams(queryString || '');
        const requestedPage = Math.max(1, Number.parseInt(query.get('page') || '1', 10) || 1);
        const selectedReason = REPORT_REASONS.includes(query.get('reason')) ? query.get('reason') : '';
        const rv = await api('GET', '/moderation/reviews?status=pending&size=20');
        const box = el('div', {}); if (!rv.data.length) box.append(el('p', { text: 'Không có bình luận chờ duyệt.' }));
        for (const r of rv.data) {
            const decide = (action) => async () => { try { await api('POST', `/moderation/reviews/${r.id}/moderate`, { action }); toast('Đã xử lý'); route(); } catch (e) { toast(e.message); } };
            box.append(el('div', { class: 'card' }, el('p', { class: 'muted', text: `#${r.id} · ${r.authorName || r.displayName || ''} · ${r.titleName || r.title || ''}` }), el('p', { text: r.body }),
                el('button', { class: 'primary', text: 'Duyệt', onclick: decide('approve') }), ' ', el('button', { class: 'danger', text: 'Từ chối', onclick: decide('reject') })));
        }
        const reportQuery = new URLSearchParams({ status: 'open', page: String(requestedPage), size: '10' });
        if (selectedReason) reportQuery.set('reason', selectedReason);
        const countRequest = (async () => {
            const counts = Object.fromEntries(REPORT_REASONS.map((reason) => [reason, 0]));
            const seenIds = new Set();
            const pageSize = 10;
            let expectedPages = null;
            for (let page = 1; page <= 100; page += 1) {
                const params = new URLSearchParams({ status: 'open', page: String(page), size: String(pageSize) });
                try {
                    const result = await api('GET', `/moderation/reports?${params}`);
                    const records = Array.isArray(result.data) ? result.data : [];
                    const pagination = result.pagination || {};
                    if (page === 1) {
                        const totalPages = pagination.totalPages === undefined || pagination.totalPages === null ? NaN : Number(pagination.totalPages);
                        const total = pagination.total === undefined || pagination.total === null ? NaN : Number(pagination.total);
                        const reportedPageSize = Number(pagination.size || pagination.pageSize) || pageSize;
                        if (Number.isFinite(totalPages) && totalPages > 0) expectedPages = Math.ceil(totalPages);
                        else if (Number.isFinite(total) && total >= 0) expectedPages = Math.max(1, Math.ceil(total / reportedPageSize));
                    }
                    let added = 0;
                    records.forEach((record) => {
                        const reason = record.reason;
                        if (!Object.prototype.hasOwnProperty.call(counts, reason)) return;
                        if (record.id !== undefined && record.id !== null) {
                            const id = String(record.id);
                            if (seenIds.has(id)) return;
                            seenIds.add(id);
                        }
                        counts[reason] += 1;
                        added += 1;
                    });
                    if (expectedPages !== null && page >= expectedPages) return { counts, complete: true };
                    if (expectedPages === null && records.length < pageSize) return { counts, complete: true };
                    if (records.length === 0) return { counts, complete: true };
                    if (added === 0) return { counts, complete: false };
                } catch (e) { return { counts, complete: false }; }
            }
            return { counts, complete: false };
        })();
        const [rp, reasonCountResult] = await Promise.all([
            api('GET', `/moderation/reports?${reportQuery}`), countRequest
        ]);
        const countByReason = Object.fromEntries(REPORT_REASONS.map((reason) => [
            reason, reasonCountResult.complete ? reasonCountResult.counts[reason] : null
        ]));
        const allReports = Array.isArray(rp.data) ? rp.data : [];
        const filteredReports = selectedReason ? allReports.filter((x) => x.reason === selectedReason) : allReports;
        const reportPagination = rp.pagination || {};
        const hasFilteredCount = Boolean(selectedReason) && countByReason[selectedReason] !== null && countByReason[selectedReason] !== undefined;
        const totalReports = hasFilteredCount
            ? Number(countByReason[selectedReason])
            : Number(reportPagination.total ?? filteredReports.length);
        const totalPages = Math.max(1, hasFilteredCount ? Math.ceil(totalReports / 10) : Number(reportPagination.totalPages || Math.ceil(totalReports / 10) || 1));
        const currentPage = Math.min(Number(reportPagination.page) || requestedPage, totalPages);
        const reportRows = Object.keys(reportPagination).length > 0 || allReports.length <= 10
            ? filteredReports
            : filteredReports.slice((requestedPage - 1) * 10, requestedPage * 10);
        const reasonFilter = el('select', { id: 'reportReasonFilter', 'aria-label': 'Lọc báo cáo theo lý do' },
            el('option', { value: '', text: 'Tất cả lý do' }),
            REPORT_REASONS.map((reason) => el('option', { value: reason, text: REPORT_REASON_LABELS[reason] })));
        reasonFilter.value = selectedReason;
        reasonFilter.addEventListener('change', () => {
            const next = new URLSearchParams(query);
            next.set('page', '1');
            if (reasonFilter.value) next.set('reason', reasonFilter.value); else next.delete('reason');
            location.hash = `#/moderation?${next}`;
        });
        const reasonStats = el('div', { class: 'report-stats', 'aria-label': 'Thống kê báo cáo theo lý do' },
            REPORT_REASONS.map((reason) => el('div', { class: 'report-stat' },
                el('span', { class: 'muted', text: REPORT_REASON_LABELS[reason] }),
                el('strong', { text: countByReason[reason] === null ? '—' : String(countByReason[reason]) }))));
        const rbox = el('div', { class: 'report-list' });
        if (!reportRows.length) rbox.append(el('p', { class: 'muted', text: 'Không có báo cáo mở phù hợp với bộ lọc.' }));
        for (const x of reportRows) {
            const handle = (decision) => async () => { try { await api('POST', `/moderation/reports/${x.id}/handle`, { decision }); toast('Đã xử lý'); route(); } catch (e) { toast(e.message); } };
            const reason = REPORT_REASONS.includes(x.reason) ? x.reason : 'other';
            const reportMeta = el('div', { class: 'report-meta' },
                el('span', { class: 'badge', text: reportReasonLabel(reason) }),
                el('code', { class: 'enum-code', text: `enum: ${x.reason || 'không xác định'}` }));
            const commentBody = x.reviewBody || (x.review && x.review.body) || x.body || '';
            rbox.append(el('div', { class: 'card report-card' },
                el('p', { class: 'muted', text: `Báo cáo #${x.id} · ${x.authorName || (x.review && x.review.authorName) || ''} · ${x.titleName || (x.review && x.review.titleName) || ''}` }),
                reportMeta, el('p', { class: 'review-body', text: commentBody }),
                el('button', { class: 'danger', text: 'Xác nhận vi phạm', onclick: handle('resolve') }), ' ', el('button', { class: 'primary', text: 'Bác bỏ', onclick: handle('dismiss') })));
        }
        const reportPageLink = (pageNumber, label) => {
            const next = new URLSearchParams(query);
            next.set('page', String(pageNumber));
            return el('a', { href: `#/moderation?${next}`, text: label });
        };
        const reportPager = el('div', { class: 'pager', 'aria-label': 'Phân trang báo cáo' },
            currentPage > 1 ? reportPageLink(currentPage - 1, '← Trước') : null,
            el('span', { text: `Trang ${currentPage}/${totalPages} · ${totalReports} báo cáo` }),
            currentPage < totalPages ? reportPageLink(currentPage + 1, 'Sau →') : null);
        main.replaceChildren(el('h2', { text: 'Hàng đợi bình luận' }), box,
            el('h2', { text: 'Báo cáo vi phạm' }),
            el('div', { class: 'card report-controls' }, el('label', { for: 'reportReasonFilter', text: 'Lọc theo lý do' }), reasonFilter),
            reasonStats, rbox, reportPager);
    }

    async function pageStats() {
        const params = new URLSearchParams(location.hash.split('?')[1] || '');
        const kind = el('select', { id: 'statsKind' }, el('option', { value: '', text: 'Phim và sách' }), el('option', { value: 'movie', text: 'Phim' }), el('option', { value: 'book', text: 'Sách' }));
        kind.value = params.get('kind') || '';
        const gran = el('select', { id: 'statsGranularity' }, el('option', { value: 'month', text: 'Theo tháng' }), el('option', { value: 'day', text: 'Theo ngày' })); gran.value = params.get('granularity') || 'month';
        const span = el('input', { id: 'statsSpan', type: 'number', min: '1', max: gran.value === 'month' ? '36' : '90', value: params.get(gran.value === 'month' ? 'months' : 'days') || (gran.value === 'month' ? '12' : '30') });
        gran.addEventListener('change', () => { span.max = gran.value === 'month' ? '36' : '90'; span.value = gran.value === 'month' ? '12' : '30'; });
        const load = el('button', { class: 'primary', text: 'Áp dụng bộ lọc', onclick: () => { const q = new URLSearchParams({ granularity: gran.value, [gran.value === 'month' ? 'months' : 'days']: String(Math.max(1, Number(span.value) || 12)) }); if (kind.value) q.set('kind', kind.value); location.hash = '#/stats?' + q; } });
        const q = new URLSearchParams({ granularity: params.get('granularity') || 'month', [((params.get('granularity') || 'month') === 'month') ? 'months' : 'days']: params.get((params.get('granularity') || 'month') === 'month' ? 'months' : 'days') || ((params.get('granularity') || 'month') === 'month' ? '12' : '30') });
        if (params.get('kind')) q.set('kind', params.get('kind'));
        const [g, timeline, overview] = await Promise.all([
            api('GET', '/stats/genres' + (params.get('kind') ? `?kind=${encodeURIComponent(params.get('kind'))}` : '')),
            api('GET', '/stats/timeline?' + q).catch((e) => ({ data: [], error: e.message })),
            api('GET', '/stats/overview').catch((e) => ({ data: null, error: e.message }))
        ]);
        const items = Array.isArray(g.data) ? g.data : [];
        const canvas = el('canvas', { id: 'chart', role: 'img', 'aria-label': 'Biểu đồ số lượt chấm theo thể loại' });
        const tb = el('tbody', {}); items.forEach((x) => tb.append(el('tr', {}, el('td', { text: x.name }), el('td', { text: x.titleCount }), el('td', { text: x.ratingCount }), el('td', { text: x.ratingAvg ?? '-' }), el('td', { text: x.reviewCount ?? '-' }), el('td', { text: x.topTitle || x.topTitleName || '-' }))));
        const statsParts = [el('h2', { text: 'Thống kê và tổng quan' }), el('div', { class: 'card row stats-filter' }, el('div', {}, el('label', { for: 'statsKind', text: 'Loại tác phẩm' }), kind), el('div', {}, el('label', { for: 'statsGranularity', text: 'Khoảng thời gian' }), gran), el('div', {}, el('label', { for: 'statsSpan', text: 'Số kỳ (tháng tối đa 36, ngày tối đa 90)' }), span), load), el('h3', { text: 'Tổng quan hệ thống' })];
        if (overview.data) {
            const ov = overview.data;
            const entries = [];
            for (const [group, value] of Object.entries(ov)) {
                if (value && typeof value === 'object' && !Array.isArray(value)) for (const [key, val] of Object.entries(value)) entries.push([`${group}.${key}`, val]);
                else entries.push([group, value]);
            }
            statsParts.push(el('div', { class: 'stats-overview' }, entries.map(([k, v]) => el('div', { class: 'card' }, el('span', { class: 'muted', text: k.replace(/([A-Z])/g, ' $1').replace(/[._]/g, ' ') }), el('strong', { text: String(v ?? '—') })))));
        } else statsParts.push(el('p', { class: 'muted', text: overview.error || 'Không có dữ liệu tổng quan.' }));
        statsParts.push(el('h3', { text: 'Thống kê theo thể loại' }), canvas, responsiveTable(el('table', {}, el('caption', { class: 'muted', text: 'Số tác phẩm, lượt chấm, điểm trung bình, bình luận và tác phẩm dẫn đầu' }), el('thead', {}, el('tr', {}, ['Thể loại', 'Số tác phẩm', 'Lượt chấm', 'Điểm TB', 'Bình luận', 'Tác phẩm dẫn đầu'].map((h) => el('th', { scope: 'col', text: h })))), tb)), el('h3', { text: 'Thống kê theo thời gian' }));
        if (timeline.error) statsParts.push(el('p', { class: 'muted', text: timeline.error }));
        else {
            const titems = Array.isArray(timeline.data?.items) ? timeline.data.items : (Array.isArray(timeline.items) ? timeline.items : []);
            const tBody = el('tbody', {}); titems.forEach((x) => tBody.append(el('tr', {}, el('td', { text: x.period || x.date || x.month || '-' }), el('td', { text: x.ratingCount ?? x.ratings ?? 0 }), el('td', { text: x.reviewCount ?? x.reviews ?? 0 }))));
            statsParts.push(responsiveTable(el('table', {}, el('thead', {}, el('tr', {}, ['Kỳ', 'Lượt chấm', 'Bình luận'].map((h) => el('th', { scope: 'col', text: h })))), tBody)));
            const totals = timeline.data?.totals || timeline.totals || {};
            statsParts.push(el('p', { class: 'muted', text: `Tổng lượt chấm: ${totals.ratingCount ?? totals.ratings ?? '—'} · Tổng bình luận: ${totals.reviewCount ?? totals.reviews ?? '—'}` }));
        }
        if (can('stats.export')) {
            statsParts.push(el('h3', { text: 'Xuất báo cáo (ADMIN)' }));
            const report = el('select', { id: 'exportReport' }, ['genres', 'timeline', 'ranking', 'catalog', 'overview'].map((x) => el('option', { value: x, text: ({ genres: 'Thể loại', timeline: 'Theo thời gian', ranking: 'Xếp hạng', catalog: 'Danh mục', overview: 'Tổng quan' })[x] })));
            const format = el('select', { id: 'exportFormat' }, el('option', { value: 'csv', text: 'CSV' }), el('option', { value: 'xlsx', text: 'Excel (.xlsx)' }));
            const delimiter = el('select', { id: 'exportDelimiter' }, el('option', { value: 'comma', text: 'Dấu phẩy' }), el('option', { value: 'semicolon', text: 'Dấu chấm phẩy (Excel tiếng Việt)' }));
            const exp = el('button', { class: 'primary', text: 'Tải báo cáo', onclick: () => { const x = new URLSearchParams({ report: report.value, format: format.value, delimiter: delimiter.value }); if (kind.value) x.set('kind', kind.value); if (report.value === 'timeline') { x.set('granularity', gran.value); x.set(gran.value === 'month' ? 'months' : 'days', span.value); } window.location.href = '/api/v1/stats/export?' + x; } });
            statsParts.push(el('div', { class: 'card row' }, el('div', {}, el('label', { for: 'exportReport', text: 'Báo cáo' }), report), el('div', {}, el('label', { for: 'exportFormat', text: 'Định dạng' }), format), el('div', {}, el('label', { for: 'exportDelimiter', text: 'Phân cách CSV' }), delimiter), exp));
        }
        if (me && me.permissions && me.permissions.includes('aggregate.rebuild')) {
            statsParts.push(el('h3', { text: 'Đối soát dữ liệu xếp hạng (ADMIN)' }), el('div', { class: 'card row' }, el('button', { class: 'primary', text: 'Đối soát bảng tổng hợp', onclick: async () => { try { const r = await api('GET', '/admin/aggregates/reconcile'); const d = r.data || r; const ok = d.consistent === true && (!Array.isArray(d.mismatches) || d.mismatches.length === 0); toast(ok ? 'Đối soát: dữ liệu khớp' : 'Đối soát hoàn tất: phát hiện chênh lệch'); const pre = el('pre', { class: 'json-result', text: JSON.stringify(d, null, 2) }); const old = document.querySelector('.aggregate-result'); if (old) old.remove(); pre.classList.add('aggregate-result'); main.append(pre); } catch (e) { toast(errText(e)); } } }), el('button', { class: 'danger', text: 'Dựng lại bảng tổng hợp', onclick: async () => { if (!confirm('Dựng lại toàn bộ bảng tổng hợp xếp hạng từ dữ liệu đánh giá?')) return; try { const r = await api('POST', '/admin/aggregates/rebuild'); toast('Đã dựng lại bảng tổng hợp'); const pre = el('pre', { class: 'json-result aggregate-result', text: JSON.stringify(r.data || r, null, 2) }); const old = document.querySelector('.aggregate-result'); if (old) old.remove(); main.append(pre); } catch (e) { toast(errText(e)); } } })));
        }
        main.replaceChildren(...statsParts);
        if (window.Chart) new window.Chart(canvas, { type: 'bar', data: { labels: items.map((x) => x.name), datasets: [{ label: 'Lượt chấm', data: items.map((x) => x.ratingCount) }] }, options: { responsive: true } });
    }

    async function pageLogs() {
        const q = new URLSearchParams(location.hash.split('?')[1] || '');
        const fields = [ ['userId','Mã người dùng','number'], ['action','Hành động','text'], ['entity','Đối tượng','text'], ['ip','IP','text'], ['from','Từ ngày (UTC)','date'], ['to','Đến ngày (UTC)','date'] ];
        const inputs = {};
        const filter = el('div', { class: 'card row log-filter' });
        for (const [id, label, type] of fields) { inputs[id] = el('input', { id: `log-${id}`, type, value: q.get(id) || '', placeholder: label }); filter.append(el('div', {}, el('label', { for: `log-${id}`, text: label }), inputs[id])); }
        let actions = [];
        try { actions = ((await api('GET', '/admin/system-logs/actions')).data || []); } catch (e) { /* API có thể trả dữ liệu ở dạng khác */ }
        const apply = el('button', { class: 'primary', text: 'Lọc nhật ký', onclick: () => { const p = new URLSearchParams(); for (const [k, input] of Object.entries(inputs)) if (input.value.trim()) p.set(k, input.value.trim()); p.set('page','1'); location.hash = '#/logs?' + p; } });
        const actionOptions = el('select', { id: 'log-action-preset' }, el('option', { value: '', text: 'Chọn hành động gợi ý' }), actions.map((a) => { const v = typeof a === 'string' ? a : (a.action || a.value || a.name); return el('option', { value: v, text: v }); }));
        actionOptions.addEventListener('change', () => { if (actionOptions.value) inputs.action.value = actionOptions.value; });
        filter.append(el('div', {}, el('label', { for: 'log-action-preset', text: 'Danh sách hành động' }), actionOptions), apply);
        const page = Math.max(1, Number(q.get('page') || 1)); q.set('page', String(page)); q.set('size', '30');
        const r = await api('GET', '/admin/system-logs?' + q);
        const tb = el('tbody', {}); (r.data || []).forEach((x) => tb.append(el('tr', {}, el('td', { text: x.createdAt }), el('td', { text: x.userName || x.userId || '-' }), el('td', { text: x.action }), el('td', { text: `${x.entity || ''} ${x.entityId || ''}` }), el('td', { text: x.ip || '' }))));
        const base = new URLSearchParams(q); base.delete('size'); const prev = new URLSearchParams(base); prev.set('page', String(page - 1)); const next = new URLSearchParams(base); next.set('page', String(page + 1)); const pager = el('div', { class: 'pager' }, page > 1 ? el('a', { href: '#/logs?' + prev, text: '← Trước' }) : null, el('span', { text: `Trang ${r.pagination?.page || page}/${r.pagination?.totalPages || 1} · ${r.pagination?.total ?? (r.data || []).length} bản ghi` }), page < (r.pagination?.totalPages || 1) ? el('a', { href: '#/logs?' + next, text: 'Sau →' }) : null);
        main.replaceChildren(el('h2', { text: 'Nhật ký hệ thống' }), filter, responsiveTable(el('table', {}, el('thead', {}, el('tr', {}, ['Thời điểm', 'Người dùng', 'Hành động', 'Đối tượng', 'IP'].map((h) => el('th', { scope: 'col', text: h })))), tb)), pager);
    }

    async function pageMyReviews() {
        const q = new URLSearchParams(location.hash.split('?')[1] || ''); q.set('size','50');
        const r = await api('GET', '/me/reviews?' + q); const rows = Array.isArray(r.data) ? r.data : [];
        const box = el('div', {});
        if (!rows.length) box.append(el('p', { class: 'muted', text: 'Bạn chưa có bình luận nào.' }));
        for (const review of rows) {
            const titleId = review.titleId ?? review.title_id ?? review.title?.id;
            const titleName = review.titleName || review.titleTitle || review.title?.title || (titleId ? `Tác phẩm #${titleId}` : 'Tác phẩm');
            const status = review.status || 'Không rõ';
            const editor = el('textarea', { rows: '4', maxlength: '2000', hidden: 'hidden' }); editor.value = review.body || '';
            const message = el('p', { class: 'err', role: 'alert' });
            const save = el('button', { class: 'primary', text: 'Lưu sửa đổi', hidden: 'hidden', onclick: async () => { try { if (editor.value.trim().length < 10) throw new Error('Bình luận phải có ít nhất 10 ký tự.'); if (!titleId) throw new Error('Không xác định được tác phẩm của bình luận.'); await api('PUT', `/titles/${titleId}/reviews/mine`, { body: editor.value.trim() }); toast('Đã sửa bình luận; bình luận đang chờ duyệt lại'); route(); } catch (e) { message.textContent = errText(e); } } });
            const edit = el('button', { class: 'primary', text: 'Sửa', onclick: () => { editor.hidden = !editor.hidden; save.hidden = editor.hidden; } });
            const del = el('button', { class: 'danger', text: 'Xóa bình luận', onclick: async () => { if (!confirm('Xóa bình luận này? Phiếu hữu ích và báo cáo gắn với bình luận cũng sẽ bị xóa.')) return; try { if (!titleId) throw new Error('Không xác định được tác phẩm của bình luận.'); await api('DELETE', `/titles/${titleId}/reviews/mine`); toast('Đã xóa bình luận'); route(); } catch (e) { toast(errText(e)); } } });
            const node = el('div', { class: 'card my-review-card' }, el('div', { class: 'review-meta-line' }, el('a', { href: titleId ? `#/title/${titleId}` : '#/', text: titleName }), el('span', { class: 'badge', text: status })), el('p', { class: 'muted', text: `Đăng: ${review.createdAt || review.created_at || '—'}${review.updatedAt || review.updated_at ? ` · Cập nhật: ${review.updatedAt || review.updated_at}` : ''}` }), el('p', { class: 'review-body', text: review.body || '' }), el('label', { text: 'Nội dung mới', hidden: 'hidden' }), editor, message, el('div', { class: 'review-actions' }, edit, save, del));
            box.append(node);
        }
        main.replaceChildren(el('h2', { text: 'Bình luận của tôi' }), el('p', { class: 'muted', text: 'Bình luận sau khi chỉnh sửa sẽ quay về trạng thái chờ duyệt. Bình luận bị ẩn có thể không được phép sửa.' }), box);
    }

    async function pageNotifications() {
        const q = new URLSearchParams(location.hash.split('?')[1] || ''); q.set('size','50');
        const unread = el('select', { id: 'notification-filter' }, el('option', { value: '', text: 'Tất cả thông báo' }), el('option', { value: 'true', text: 'Chưa đọc' }), el('option', { value: 'false', text: 'Đã đọc' })); unread.value = q.get('unread') || '';
        unread.addEventListener('change', () => { const p = new URLSearchParams(); if (unread.value) p.set('unread', unread.value); location.hash = '#/notifications?' + p; });
        const r = await api('GET', '/me/notifications?' + q); const rows = Array.isArray(r.data) ? r.data : [];
        const unreadCount = r.unreadCount ?? r.meta?.unreadCount ?? r.data?.unreadCount;
        const box = el('div', {});
        if (!rows.length) box.append(el('p', { class: 'muted', text: 'Không có thông báo phù hợp.' }));
        for (const n of rows) {
            const isRead = Boolean(n.readAt || n.read || n.isRead || n.is_read);
            box.append(el('div', { class: `card notification-card${isRead ? ' is-read' : ' is-unread'}` }, el('div', { class: 'review-meta-line' }, el('strong', { text: n.title || n.subject || n.type || 'Thông báo' }), el('span', { class: 'badge', text: isRead ? 'Đã đọc' : 'Chưa đọc' })), el('p', { text: n.message || n.body || n.content || '' }), el('p', { class: 'muted', text: n.createdAt || n.created_at || '' }), !isRead ? el('button', { class: 'primary', text: 'Đánh dấu đã đọc', onclick: async () => { try { await api('POST', `/me/notifications/${n.id}/read`); toast('Đã đánh dấu đã đọc'); route(); } catch (e) { toast(errText(e)); } } }) : null));
        }
        main.replaceChildren(el('h2', { text: 'Thông báo của tôi' }), el('div', { class: 'card row' }, el('div', {}, el('label', { for: 'notification-filter', text: 'Lọc thông báo' }), unread), el('p', { class: 'muted', text: unreadCount !== undefined ? `Chưa đọc: ${unreadCount}` : '' }), el('button', { class: 'primary', text: 'Đánh dấu tất cả đã đọc', onclick: async () => { try { await api('POST', '/me/notifications/read-all'); toast('Đã đánh dấu tất cả thông báo đã đọc'); route(); } catch (e) { toast(errText(e)); } } })), box);
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
            responsiveTable(el('table', {}, el('thead', {}, el('tr', {}, ['Mã', 'Email', 'Tên hiển thị', 'Trạng thái', 'Vai trò', 'Thao tác'].map((h) => el('th', { scope: 'col', text: h })))), tb)),
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
            const tb = el('tbody', {}); r.data.forEach((x) => { const tr = el('tr', {}, el('td', { text: x.id }), el('td', {}, el('button', { class: 'link', text: x.fullName, onclick: async () => { try { const d = (await api('GET', `/persons/${x.id}`)).data; const name = prompt('Họ và tên', d.fullName || x.fullName); if (name === null) return; const year = prompt('Năm sinh (để trống nếu không có)', d.birthYear || ''); if (year === null) return; const country = prompt('Quốc gia (để trống nếu không có)', d.country || ''); if (country === null) return; const payload = { fullName: name.trim(), birthYear: year.trim() ? Number(year) : null, country: country.trim() || null }; await api('PUT', `/persons/${x.id}`, payload); toast('Đã cập nhật nhân vật'); loadPersons(ps.value.trim()); } catch (e) { toast(errText(e)); } } })), el('td', { text: x.birthYear || '' }), el('td', { text: x.country || '' }), el('td', {}, el('button', { class: 'link', text: 'Chi tiết', onclick: async () => { try { const d = (await api('GET', `/persons/${x.id}`)).data; alert(`Mã: ${d.id || x.id}\nHọ tên: ${d.fullName || x.fullName}\nNăm sinh: ${d.birthYear || '—'}\nQuốc gia: ${d.country || '—'}`); } catch (e) { toast(errText(e)); } } }))); tb.append(tr); });
            plist.replaceChildren(responsiveTable(el('table', {}, el('thead', {}, el('tr', {}, ['Mã', 'Họ tên', 'Năm sinh', 'Quốc gia', 'Thao tác'].map((h) => el('th', { scope: 'col', text: h })))), tb)));
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
                el('td', {}, el('button', { class: 'link', text: 'Sửa', onclick: async () => { const code = prompt('Mã thể loại', g.code); if (code === null) return; const name = prompt('Tên thể loại', g.name); if (name === null) return; try { await api('PUT', `/genres/${g.id}`, { code: code.trim(), name: name.trim(), appliesTo: g.appliesTo || 'both' }); toast('Đã cập nhật thể loại'); route(); } catch (e) { toast(errText(e)); } } }), ' ', el('button', { class: 'danger', text: 'Xóa', onclick: async () => { if (!confirm(`Xóa thể loại ${g.name}?`)) return; try { await api('DELETE', `/genres/${g.id}`); toast('Đã xóa thể loại'); route(); } catch (e) { toast(errText(e)); } } })))));
            parts.push(el('h2', { text: 'Thể loại (ADMIN)' }),
                card('Thêm thể loại', [{ id: 'code', label: 'Mã (a-z, 0-9, _ -)' }, { id: 'name', label: 'Tên thể loại' }], 'Thêm thể loại', async (v) => { await api('POST', '/genres', { code: v.code, name: v.name, appliesTo: 'both' }); toast('Đã thêm thể loại'); route(); }),
                responsiveTable(el('table', {}, el('thead', {}, el('tr', {}, ['Mã', 'Tên', 'Áp dụng', 'Thao tác'].map((h) => el('th', { scope: 'col', text: h })))), gtb)));
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
            else if (parts[0] === 'title' && parts[1]) await pageTitle(parts[1], qs || '');
            else if (parts[0] === 'ranking') await pageRanking(qs || '');
            else if (parts[0] === 'watchlist') await pageWatchlist();
            else if (parts[0] === 'my-reviews') await pageMyReviews();
            else if (parts[0] === 'notifications') await pageNotifications();
            else if (parts[0] === 'moderation') await pageModeration(qs || '');
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
