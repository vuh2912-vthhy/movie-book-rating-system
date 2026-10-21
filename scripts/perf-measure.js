#!/usr/bin/env node
'use strict';
/**
 * Đo thời gian phản hồi: mỗi điểm cuối gọi 50 lần (bỏ 3 lần khởi động), lấy TRUNG VỊ và P95.
 *   node scripts/perf-measure.js https://ten-mien.vercel.app --label=truoc
 *   ...tối ưu...
 *   node scripts/perf-measure.js https://ten-mien.vercel.app --label=sau
 *   node scripts/perf-measure.js --compare      -> in bảng so sánh Mục 5.4 từ hai tệp perf-truoc.json, perf-sau.json
 * Ghi kết quả vào perf-<label>.json. Cần Node 18+. Đặt ADMIN_EMAIL/ADMIN_PASSWORD để đo cả điểm cuối cần quyền.
 */
const fs = require('fs');
const BASE = (process.argv.find((a, i) => i > 1 && a.startsWith('http')) || process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const LABEL = (process.argv.find((a) => a.startsWith('--label=')) || '--label=lan1').slice(8);
const RUNS = 50, WARM = 3;
const API = `${BASE}/api/v1`;

if (process.argv.includes('--compare')) {
    const a = JSON.parse(fs.readFileSync('perf-truoc.json', 'utf8')), b = JSON.parse(fs.readFileSync('perf-sau.json', 'utf8'));
    console.log('| Điểm cuối | Trước (ms) | Sau (ms) | Cải thiện |\n|---|--:|--:|--:|');
    for (const k of Object.keys(a.results)) {
        const x = a.results[k].median, y = (b.results[k] || {}).median;
        console.log(`| \`${k}\` | ${x.toFixed(0)} | ${y === undefined ? '-' : y.toFixed(0)} | ${y === undefined ? '-' : (((x - y) / x) * 100).toFixed(1) + '%'} |`);
    }
    process.exit(0);
}

const median = (v) => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const p95 = (v) => { const s = [...v].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]; };

(async () => {
    let cookie = null;
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
        const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
        cookie = ((typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : []).find((c) => c.startsWith('accessToken=')) || '').split(';')[0] || null;
    }
    const first = await (await fetch(`${API}/titles?size=1`)).json();
    const id = ((first.data && (first.data.items || first.data)) || [{ id: 1 }])[0].id;
    const targets = [
        ['GET /titles?page=1&size=20', '/titles?page=1&size=20', false],
        ['GET /titles?kind=movie&yearFrom=1990&yearTo=2010&sort=year', '/titles?kind=movie&yearFrom=1990&yearTo=2010&sort=year&size=20', false],
        ['GET /titles?keyword=mo phong&kind=movie', '/titles?keyword=mo%20phong&kind=movie&size=20', false],
        [`GET /titles/${id}`, `/titles/${id}`, false],
        ['GET /stats/ranking?source=live', '/stats/ranking?source=live&limit=20', false],
        ['GET /stats/ranking?source=aggregate', '/stats/ranking?source=aggregate&limit=20', false],
        [`GET /titles/${id}/reviews`, `/titles/${id}/reviews`, false],
        ['GET /stats/overview (ADMIN)', '/stats/overview', true]
    ];
    const results = {};
    console.log(`ĐO HIỆU NĂNG | ${BASE} | nhãn: ${LABEL} | ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })}`);
    for (const [name, path, needAuth] of targets) {
        if (needAuth && !cookie) { console.log(`  bỏ qua ${name} (thiếu ADMIN_EMAIL/ADMIN_PASSWORD)`); continue; }
        const t = [];
        let status = 0;
        for (let i = 0; i < RUNS + WARM; i++) {
            const t0 = performance.now();
            const res = await fetch(API + path, { headers: cookie ? { Cookie: cookie } : {} });
            await res.arrayBuffer();
            const dt = performance.now() - t0;
            status = res.status;
            if (i >= WARM) t.push(dt);
        }
        results[name] = { status, runs: t.length, median: median(t), p95: p95(t), min: Math.min(...t), max: Math.max(...t) };
        console.log(`  ${name.padEnd(46)} HTTP ${status}  trung vị ${median(t).toFixed(0).padStart(5)} ms   p95 ${p95(t).toFixed(0).padStart(5)} ms`);
    }
    fs.writeFileSync(`perf-${LABEL}.json`, JSON.stringify({ base: BASE, label: LABEL, runs: RUNS, takenAt: new Date().toISOString(), results }, null, 2));
    console.log(`Đã ghi perf-${LABEL}.json (công cụ: fetch của Node ${process.version}, ${RUNS} lần/điểm cuối, trị số dùng: trung vị)`);
})().catch((e) => { console.error(e.message); process.exit(1); });
