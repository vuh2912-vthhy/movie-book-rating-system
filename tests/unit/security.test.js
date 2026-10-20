'use strict';
const { fresh, req, res } = require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const sec = fresh('src/middlewares/securityMiddleware');
const requestId = require('../../src/middlewares/requestId');
const { errorHandler } = require('../../src/middlewares/errorHandler');
const HttpError = require('../../src/utils/httpError');
const run = (mw, r, s = res()) => { let err; mw(r, s, (e) => { err = e; }); return { err, res: s }; };

test('UT-28 BM12: gắn đủ 6 thẻ tiêu đề bảo mật', () => {
    const { res: s } = run(sec.securityHeaders, req({ method: 'GET' }));
    for (const h of ['strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'content-security-policy', 'permissions-policy']) assert.ok(s.headers[h], h);
    assert.equal(s.headers['x-content-type-options'], 'nosniff'); assert.equal(s.headers['x-frame-options'], 'DENY');
    assert.match(s.headers['content-security-policy'], /frame-ancestors 'none'/);
});
test('UT-29 BM3: cookie + Origin lạ bị chặn 403 CSRF_BLOCKED', () => {
    const { err } = run(sec.csrfProtection, req({ cookies: { accessToken: 't' }, headers: { host: 'app.example', origin: 'https://evil.example', 'content-type': 'application/json' } }));
    assert.equal(err.statusCode, 403); assert.equal(err.code, 'CSRF_BLOCKED');
});
test('UT-30 BM3: Referer lạ (không có Origin) cũng bị chặn', () => {
    const { err } = run(sec.csrfProtection, req({ cookies: { accessToken: 't' }, headers: { host: 'app.example', referer: 'https://evil.example/x' } }));
    assert.equal(err.code, 'CSRF_BLOCKED');
});
test('UT-31 BM3: cùng nguồn gốc + JSON được qua; cùng nguồn gốc nhưng text/plain bị chặn', () => {
    const ok = run(sec.csrfProtection, req({ cookies: { accessToken: 't' }, headers: { host: 'app.example', origin: 'https://app.example', 'content-type': 'application/json' } }));
    assert.equal(ok.err, undefined);
    const bad = run(sec.csrfProtection, req({ cookies: { accessToken: 't' }, headers: { host: 'app.example', origin: 'https://app.example', 'content-type': 'text/plain' } }));
    assert.equal(bad.err.code, 'CSRF_BLOCKED');
});
test('UT-32 BM3: GET, yêu cầu không cookie (Bearer) và công cụ ngoài trình duyệt (không Origin) được miễn', () => {
    assert.equal(run(sec.csrfProtection, req({ method: 'GET', cookies: { accessToken: 't' }, headers: { origin: 'https://evil.example' } })).err, undefined);
    assert.equal(run(sec.csrfProtection, req({ headers: { origin: 'https://evil.example' } })).err, undefined);
    assert.equal(run(sec.csrfProtection, req({ cookies: { accessToken: 't' }, headers: { host: 'app.example' } })).err, undefined);
});
test('UT-33 BM10: giới hạn tần suất chặn yêu cầu vượt ngưỡng bằng 429 kèm Retry-After; skip hoạt động', () => {
    const limiter = sec.rateLimit({ windowMs: 60000, max: 3, code: 'T_TEST', skip: (r) => r.method === 'GET' });
    const r = req({ ip: '9.9.9.9' }); let last;
    for (let i = 0; i < 4; i += 1) last = run(limiter, r);
    assert.equal(last.err.statusCode, 429); assert.ok(last.res.headers['retry-after']);
    assert.equal(run(limiter, req({ ip: '9.9.9.9', method: 'GET' })).err, undefined);
    assert.equal(run(limiter, req({ ip: '8.8.8.8' })).err, undefined);
});
test('UT-34 BM9: requestId gắn tiêu đề; phản hồi lỗi có requestId; lỗi 500 không lộ chi tiết', () => {
    const r = req(); const s = res(); requestId(r, s, () => {});
    assert.match(r.id, /^[0-9a-f-]{36}$/); assert.equal(s.headers['x-request-id'], r.id);
    const out = {}; const sres = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; }, headersSent: false };
    const orig = console.error; console.error = () => {};
    errorHandler(new Error('SELECT * FROM users WHERE ... at /src/secret.js:10'), { ...r, method: 'GET', originalUrl: '/x' }, sres, () => {});
    console.error = orig;
    assert.equal(out.status, 500); assert.equal(out.body.error.requestId, r.id);
    assert.ok(!/SELECT|secret\.js/.test(JSON.stringify(out.body)));
    const o2 = {}; const s2 = { status(c) { o2.status = c; return this; }, json(b) { o2.body = b; return this; }, headersSent: false };
    errorHandler(HttpError.forbidden('x'), { ...r, method: 'GET', originalUrl: '/x' }, s2, () => {});
    assert.equal(o2.status, 403); assert.equal(o2.body.error.code, 'FORBIDDEN');
});
