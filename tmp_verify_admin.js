// Temp verification script - deleted after use
const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_for_verification';

const db = require('./src/config/database');
const adminRoutes = require('./src/routes/adminRoutes');
const { verifyToken, isAdmin } = require('./src/middlewares/authMiddleware');
const logController = require('./src/controllers/logController');

assert.strictEqual(typeof adminRoutes, 'function', 'adminRoutes must export a router');
assert.strictEqual(typeof verifyToken, 'function', 'verifyToken must be a function');
assert.strictEqual(typeof isAdmin, 'function', 'isAdmin must be a function');
assert.strictEqual(typeof logController.getLogs, 'function', 'getLogs must be a function');
console.log('PASS 1: modules resolve, casing fix holds (no MODULE_NOT_FOUND)');

const app = require('./server.js');
const PORT = 4125;
const server = app.listen(PORT);

const request = (token, query = '', useBearer = false) => new Promise((resolve, reject) => {
    const headers = {};
    if (token) {
        if (useBearer) headers.Authorization = 'Bearer ' + token;
        else headers.Cookie = 'accessToken=' + token;
    }
    http.get({ host: '127.0.0.1', port: PORT, path: '/api/v1/admin/system-logs' + query, headers }, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
            try { resolve({ status: res.statusCode, json: JSON.parse(body) }); }
            catch (e) { reject(new Error('non-JSON response: ' + body)); }
        });
    }).on('error', reject);
});

const sign = (payload, opts) => jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS256', ...opts });

const created = { userId: null, roleId: null, logId: null };
const TEMP_EMAIL = 'verify-temp-admin@example.test';
const TEMP_NAME = 'Temp Verify Admin';

async function seed() {
    const [u] = await db.query(
        'INSERT INTO users (email, password_hash, full_name, status, created_at) VALUES (?, ?, ?, ?, NOW())',
        [TEMP_EMAIL, 'x', TEMP_NAME, 'active']
    );
    created.userId = u.insertId;

    const [r] = await db.query('INSERT INTO roles (code, name) VALUES (?, ?)', ['admin', 'Quan tri vien']);
    created.roleId = r.insertId;

    await db.query('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [created.userId, created.roleId]);

    const [l] = await db.query(
        'INSERT INTO audit_logs (user_id, action, entity, entity_id, ip, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [created.userId, 'LOGIN_SUCCESS', 'users', created.userId, '127.0.0.1']
    );
    created.logId = l.insertId;
}

async function cleanup() {
    try {
        if (created.logId) await db.query('DELETE FROM audit_logs WHERE id = ?', [created.logId]);
        if (created.userId && created.roleId) {
            await db.query('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?', [created.userId, created.roleId]);
        }
        if (created.roleId) await db.query('DELETE FROM roles WHERE id = ?', [created.roleId]);
        if (created.userId) await db.query('DELETE FROM users WHERE id = ?', [created.userId]);
        console.log('CLEANUP: temporary rows removed from users/roles/user_roles/audit_logs');
    } catch (e) {
        console.error('CLEANUP ERROR:', e.message);
    }
}
(async () => {
    let n = 1;

    const anon = await request(null);
    assert.strictEqual(anon.status, 401, 'anon must be 401, got ' + anon.status);
    console.log('PASS ' + (++n) + ': no token -> 401 ' + anon.json.message);

    const garbage = await request('not.a.real.token');
    assert.strictEqual(garbage.status, 401, 'garbage must be 401');
    console.log('PASS ' + (++n) + ': garbage token -> 401 ' + garbage.json.message);

    const expired = await request(sign({ email: TEMP_EMAIL, role: 'admin' }, { expiresIn: '-10s' }));
    assert.strictEqual(expired.status, 401, 'expired must be 401');
    console.log('PASS ' + (++n) + ': expired token -> 401 ' + expired.json.message);

    const normal = await request(sign({ id: 999999, email: 'nobody@example.test', role: 'user' }));
    assert.strictEqual(normal.status, 403, 'non-admin must be 403, got ' + normal.status);
    console.log('PASS ' + (++n) + ': plain user -> 403 ' + normal.json.message);

    await seed();
    console.log('SEEDED: user id=' + created.userId + ', role id=' + created.roleId + ', log id=' + created.logId);

    // Token carries only the email: proves the DB RBAC lookup path grants access
    const dbAdmin = await request(sign({ email: TEMP_EMAIL }));
    assert.strictEqual(dbAdmin.status, 200, 'DB-RBAC admin must be 200, got ' + dbAdmin.status + ' ' + JSON.stringify(dbAdmin.json));
    assert.strictEqual(dbAdmin.json.pagination.totalRecords, 1, 'totalRecords must be 1');
    assert.strictEqual(dbAdmin.json.pagination.currentPage, 1, 'currentPage must be 1');
    assert.strictEqual(dbAdmin.json.data[0].full_name, TEMP_NAME, 'join must expose users.full_name');
    console.log('PASS ' + (++n) + ': RBAC table grants admin -> 200, full_name join ok, ' + JSON.stringify(dbAdmin.json.pagination));

    // Paging clamp: negative page and oversized size must not blow up
    const clamped = await request(sign({ email: TEMP_EMAIL }), '?page=-3&size=9999');
    assert.strictEqual(clamped.status, 200, 'clamped paging must be 200, got ' + clamped.status);
    assert.strictEqual(clamped.json.pagination.currentPage, 1, 'page clamped to 1');
    assert.strictEqual(clamped.json.pagination.pageSize, 50, 'size clamped to 50');
    console.log('PASS ' + (++n) + ': negative/oversized paging clamped to page=1 size=50');

    const junk = await request(sign({ email: TEMP_EMAIL }), '?page=abc&size=xyz');
    assert.strictEqual(junk.status, 200, 'junk paging must be 200');
    assert.strictEqual(junk.json.pagination.pageSize, 20, 'junk size falls back to 20');
    assert.strictEqual(junk.json.pagination.currentPage, 1, 'junk page falls back to 1');
    console.log('PASS ' + (++n) + ': non-numeric paging falls back to defaults');

    // Fallback path: signed claim only, no DB row for that email
    const claimAdmin = await request(sign({ email: 'ghost@example.test', role: 'admin' }));
    assert.strictEqual(claimAdmin.status, 200, 'signed claim admin must be 200, got ' + claimAdmin.status);
    console.log('PASS ' + (++n) + ': signed role claim still grants access');

    // Token supplied via Authorization header instead of the cookie
    const bearer = await request(sign({ email: TEMP_EMAIL }), '', true);
    assert.strictEqual(bearer.status, 200, 'bearer token must be 200, got ' + bearer.status);
    console.log('PASS ' + (++n) + ': Authorization Bearer accepted');

    await cleanup();
    server.close();
    console.log('ALL CHECKS PASSED');
    process.exit(0);
})().catch(async (e) => {
    console.error('FAILED:', e.message);
    await cleanup();
    server.close();
    process.exit(1);
});
