#!/usr/bin/env node
'use strict';

const BASE = (process.argv.find((a) => a.startsWith('http')) || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const N = Number((process.argv.find((a) => a.startsWith('--n=')) || '--n=20').slice(4));
const API = `${BASE}/api/v1`;
const PW = 'MatKhau12345';
const stamp = Date.now();

async function call(method, path, { body, cookie } = {}) {
    const headers = {}; if (body !== undefined) headers['Content-Type'] = 'application/json'; if (cookie) headers.Cookie = cookie;
    const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let json = null; try { json = await res.json(); } catch (e) { /* không phải JSON */ }
    const sc = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie().find((c) => c.startsWith('accessToken=')) : null;
    return { status: res.status, json, cookie: sc ? sc.split(';')[0] : null };
}
const tally = (list) => list.reduce((m, s) => { m[s] = (m[s] || 0) + 1; return m; }, {});
const fmt = (m) => Object.entries(m).map(([k, v]) => `${v} x HTTP ${k}`).join(', ');

(async () => {
    console.log(`KIỂM THỬ ĐỒNG THỜI | ${BASE} | ${new Date().toLocaleString('vi-VN', { hour12: false })} | N = ${N}`);
    const list = await call('GET', '/titles?size=1');
    const title = list.json && list.json.data && list.json.data[0];
    if (!title) throw new Error('Không lấy được tác phẩm: hệ thống có đang chạy và có dữ liệu không?');
    const before = (await call('GET', `/titles/${title.id}`)).json.data.stats.ratingCount;
    console.log(`Tác phẩm #${title.id} "${title.title}": số lượt chấm trước = ${before}`);

    const users = [];
    for (let i = 0; i <= N; i += 1) users.push(`concdemo_${stamp}_${i}@demo.local`); // người thứ N là người "bấm 30 lần"
    await Promise.all(users.map((email) => call('POST', '/auth/register', { body: { email, password: PW, fullName: 'Nguyen Thu Dong Thoi' } })));
    const cookies = (await Promise.all(users.map((email) => call('POST', '/auth/login', { body: { email, password: PW } })))).map((r) => r.cookie);
    if (cookies.some((c) => !c)) throw new Error('Có tài khoản không đăng nhập được (có thể đã chạm giới hạn tần suất, đợi 15 phút).');

    // (a) N người khác nhau cùng chấm một tác phẩm trong cùng một lúc
    const a = await Promise.all(cookies.slice(0, N).map((cookie, i) => call('PUT', `/titles/${title.id}/rating`, { body: { score: (i % 5) + 1 }, cookie })));
    // (b) một người bấm chấm 30 lần song song
    const b = await Promise.all(Array.from({ length: 30 }, () => call('PUT', `/titles/${title.id}/rating`, { body: { score: 5 }, cookie: cookies[N] })));
    const after = (await call('GET', `/titles/${title.id}`)).json.data.stats.ratingCount;

    const ta = tally(a.map((r) => r.status)); const tb = tally(b.map((r) => r.status));
    const okA = (ta[201] || 0) === N && Object.keys(ta).length === 1;
    const okB = (tb[201] || 0) === 1 && (tb[200] || 0) === 29;
    const okC = after === before + N + 1;
    console.log(`\n(a) ${N} người khác nhau chấm đồng thời : ${fmt(ta)}  -> ${okA ? 'ĐẠT' : 'KHÔNG ĐẠT'} (kỳ vọng ${N} x 201)`);
    console.log(`(b) 1 người bấm 30 lần song song       : ${fmt(tb)}  -> ${okB ? 'ĐẠT' : 'KHÔNG ĐẠT'} (kỳ vọng 1 x 201 và 29 x 200)`);
    console.log(`(c) số lượt chấm: trước ${before}, sau ${after}, kỳ vọng ${before + N + 1} -> ${okC ? 'ĐẠT' : 'KHÔNG ĐẠT'} (không mất, không trùng)`);

    await Promise.all(cookies.map((cookie) => call('DELETE', `/titles/${title.id}/rating`, { cookie })));
    const restored = (await call('GET', `/titles/${title.id}`)).json.data.stats.ratingCount;
    console.log(`Dọn dẹp: xóa các điểm đã tạo, số lượt chấm = ${restored} (ban đầu ${before}) -> ${restored === before ? 'ĐẠT' : 'KHÔNG ĐẠT'}`);
    const all = okA && okB && okC && restored === before;
    console.log(`\nTỔNG KẾT: ${all ? 'TẤT CẢ ĐẠT' : 'CÓ MỤC KHÔNG ĐẠT'}`);
    process.exit(all ? 0 : 1);
})().catch((e) => { console.error('Lỗi chạy script:', e.message); process.exit(1); });
