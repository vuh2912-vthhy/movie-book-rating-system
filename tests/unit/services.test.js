'use strict';
const { mock, fresh } = require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const calls = [];
const log = (name) => (...args) => { calls.push([name, ...args]); };
const audit = [];
mock('src/services/auditLogService', { logAction: async (...a) => { audit.push(a[1]); } });

// ------------------------------------------------------------------ AccountService
const state = { hash: bcrypt.hashSync('MatKhauCu123', 4), activeUser: null, resetOk: true };
mock('src/repositories/userRepository', {
    findPasswordHashById: async () => ({ id: 1, password_hash: state.hash }),
    updatePassword: async (...a) => { calls.push(['updatePassword', ...a]); return 1; },
    updateProfile: async (...a) => { calls.push(['updateProfile', ...a]); return 1; },
    findAuthContextById: async () => ({ id: 1, email: 'a@demo.local', fullName: 'Nguyen A', displayName: 'A', roles: ['USER'], permissions: [] }),
    findActiveByEmail: async () => state.activeUser
});
mock('src/repositories/passwordResetRepository', {
    create: async (...a) => { calls.push(['resetCreate', ...a]); },
    consumeAndSetPassword: async (...a) => { calls.push(['consume', ...a]); return state.resetOk ? 5 : null; }
});
const AccountService = fresh('src/services/accountService');
const user = { id: 1 };
const reset = () => { calls.length = 0; audit.length = 0; };
const lastCall = (n) => calls.filter((c) => c[0] === n).pop();

test('UT-12 đổi mật khẩu: sai mật khẩu hiện tại bị từ chối 422 và KHÔNG ghi mật khẩu mới', async () => {
    reset();
    await assert.rejects(AccountService.changePassword(user, { currentPassword: 'sai-roi-123', newPassword: 'MatKhauMoi456' }, 'ip'),
        (e) => e.statusCode === 422 && e.code === 'CURRENT_PASSWORD_INVALID');
    assert.equal(lastCall('updatePassword'), undefined);
    assert.deepEqual(audit, ['PASSWORD_CHANGE_REJECTED']);
});
test('UT-13 đổi mật khẩu: mật khẩu mới trùng cũ hoặc quá ngắn bị 422', async () => {
    reset();
    await assert.rejects(AccountService.changePassword(user, { currentPassword: 'MatKhauCu123', newPassword: 'MatKhauCu123' }, 'ip'), (e) => e.statusCode === 422);
    await assert.rejects(AccountService.changePassword(user, { currentPassword: 'MatKhauCu123', newPassword: 'ngan' }, 'ip'), (e) => e.statusCode === 422);
    assert.equal(lastCall('updatePassword'), undefined);
});
test('UT-14 đổi mật khẩu thành công: ghi MÃ BĂM bcrypt (không phải văn bản thuần) và ghi nhật ký', async () => {
    reset();
    await AccountService.changePassword(user, { currentPassword: 'MatKhauCu123', newPassword: 'MatKhauMoi456' }, 'ip');
    const [, uid, hash] = lastCall('updatePassword');
    assert.equal(uid, 1); assert.notEqual(hash, 'MatKhauMoi456'); assert.match(hash, /^\$2[aby]\$/);
    assert.ok(await bcrypt.compare('MatKhauMoi456', hash));
    assert.deepEqual(audit, ['PASSWORD_CHANGE']);
});
test('UT-15 quên mật khẩu: email không tồn tại nhận cùng thông điệp, không lộ mã', async () => {
    reset(); state.activeUser = null;
    const out = await AccountService.forgotPassword({ email: 'khong-co@demo.local' }, 'ip');
    assert.match(out.message, /Nếu thư điện tử đã đăng ký/); assert.equal(out.simulatedEmail, undefined); assert.equal(lastCall('resetCreate'), undefined);
});
test('UT-16 quên mật khẩu: chỉ lưu BĂM của mã; mã gốc chỉ có trong thư mô phỏng', async () => {
    reset(); state.activeUser = { id: 9, email: 'u@demo.local' };
    const out = await AccountService.forgotPassword({ email: 'U@demo.local ' }, 'ip');
    const code = out.simulatedEmail.resetCode;
    assert.match(code, /^[a-f0-9]{64}$/);
    const [, uid, storedHash, ttl] = lastCall('resetCreate');
    assert.equal(uid, 9); assert.equal(ttl, 30);
    assert.equal(storedHash, crypto.createHash('sha256').update(code).digest('hex')); assert.notEqual(storedHash, code);
    assert.deepEqual(audit, ['PASSWORD_RESET_REQUEST']);
});
test('UT-17 đặt lại mật khẩu: mã sai định dạng 422; mã hết hạn/đã dùng 422; hợp lệ thì đặt mật khẩu băm', async () => {
    reset();
    await assert.rejects(AccountService.resetPassword({ token: 'abc', newPassword: 'MatKhauMoi456' }, 'ip'), (e) => e.statusCode === 422);
    state.resetOk = false; const token = 'a'.repeat(64);
    await assert.rejects(AccountService.resetPassword({ token, newPassword: 'MatKhauMoi456' }, 'ip'), (e) => e.code === 'RESET_TOKEN_INVALID');
    state.resetOk = true;
    await AccountService.resetPassword({ token, newPassword: 'MatKhauMoi456' }, 'ip');
    const [, tokenHash, pwHash] = lastCall('consume');
    assert.equal(tokenHash, crypto.createHash('sha256').update(token).digest('hex')); assert.match(pwHash, /^\$2[aby]\$/);
    assert.deepEqual(audit, ['PASSWORD_RESET']);
});
test('UT-18 hồ sơ: cần ít nhất một trường; không chấp nhận thẻ < >', async () => {
    reset();
    await assert.rejects(AccountService.updateProfile(user, {}, 'ip'), (e) => e.statusCode === 422);
    await assert.rejects(AccountService.updateProfile(user, { displayName: '<script>x</script>' }, 'ip'), (e) => e.statusCode === 422);
    const p = await AccountService.updateProfile(user, { displayName: 'Bao An' }, 'ip');
    assert.equal(p.email, 'a@demo.local'); assert.equal(lastCall('updateProfile')[2].displayName, 'Bao An');
});

// ------------------------------------------------------------------ UserAdminService
const store = { target: { id: 2, email: 'b@demo.local', full_name: 'B', display_name: 'B', status: 'active', roles: 'USER' }, role: { ok: true } };
mock('src/repositories/userRepository', {
    findSummaryById: async () => store.target,
    setStatus: async (...a) => { calls.push(['setStatus', ...a]); store.target = { ...store.target, status: a[1] }; return 1; },
    replaceRole: async (...a) => { calls.push(['replaceRole', ...a]); return store.role; },
    listPaginated: async (f, limit, offset) => { calls.push(['list', f, limit, offset]); return { rows: [store.target], total: 1 }; }
});
const UserAdminService = fresh('src/services/userAdminService');
const admin = { id: 1 };

test('UT-19 quản trị: không tự khóa mình; người không tồn tại 404; khóa xong thu hồi qua setStatus', async () => {
    reset();
    await assert.rejects(UserAdminService.lock(admin, '1', 'ip'), (e) => e.code === 'CANNOT_LOCK_SELF' && e.statusCode === 422);
    store.target = null; await assert.rejects(UserAdminService.lock(admin, '99', 'ip'), (e) => e.statusCode === 404);
    store.target = { id: 2, email: 'b@demo.local', status: 'active', roles: 'USER' };
    const out = await UserAdminService.lock(admin, '2', 'ip');
    assert.equal(out.status, 'locked'); assert.deepEqual(lastCall('setStatus').slice(1), [2, 'locked']); assert.deepEqual(audit, ['USER_LOCK']);
});
test('UT-20 quản trị: mở khóa, và khóa lần hai là idempotent (không ghi lại)', async () => {
    reset(); store.target = { id: 2, email: 'b@demo.local', status: 'locked', roles: 'USER' };
    await UserAdminService.unlock(admin, '2', 'ip'); assert.deepEqual(audit, ['USER_UNLOCK']);
    reset(); store.target = { id: 2, email: 'b@demo.local', status: 'locked', roles: 'USER' };
    await UserAdminService.lock(admin, '2', 'ip'); assert.equal(lastCall('setStatus'), undefined);
});
test('UT-21 đổi vai trò: vai trò sai 422; tự hạ quyền 422; ADMIN cuối cùng 409; thành công ghi nhật ký', async () => {
    reset(); store.target = { id: 2, email: 'b@demo.local', status: 'active', roles: 'USER' };
    await assert.rejects(UserAdminService.setRole(admin, '2', { role: 'GUEST' }, 'ip'), (e) => e.statusCode === 422);
    await assert.rejects(UserAdminService.setRole(admin, '1', { role: 'USER' }, 'ip'), (e) => e.code === 'CANNOT_DEMOTE_SELF');
    store.role = { lastAdmin: true };
    await assert.rejects(UserAdminService.setRole(admin, '2', { role: 'USER' }, 'ip'), (e) => e.statusCode === 409 && e.code === 'LAST_ADMIN');
    store.role = { notFound: true };
    await assert.rejects(UserAdminService.setRole(admin, '2', { role: 'MODERATOR' }, 'ip'), (e) => e.statusCode === 404);
    store.role = { ok: true }; audit.length = 0;
    const out = await UserAdminService.setRole(admin, '2', { role: 'MODERATOR' }, 'ip');
    assert.ok(out.id === 2); assert.deepEqual(audit, ['USER_ROLE_CHANGE']);
});
test('UT-22 danh sách người dùng: bộ lọc sai 422; kích thước trang bị cắt về 50', async () => {
    reset();
    await assert.rejects(UserAdminService.list({ status: 'xoa' }), (e) => e.statusCode === 422);
    await UserAdminService.list({ size: '9999', q: 'an' });
    const c = lastCall('list'); assert.equal(c[2], 50); assert.equal(c[1].q, 'an');
});

// ------------------------------------------------------------------ GenreService
const g = { dup: false, affected: 1, exists: true };
mock('src/repositories/genreRepository', {
    findAll: async () => [], findById: async () => (g.exists ? { id: 3, code: 'drama', name: 'Chính kịch', applies_to: 'both' } : null),
    create: async () => { if (g.dup) { const e = new Error('dup'); e.code = 'ER_DUP_ENTRY'; throw e; } return 3; },
    update: async () => 1, deleteIfUnused: async () => g.affected
});
const GenreService = fresh('src/services/genreService');
test('UT-23 thể loại: mã trùng 409; mã sai định dạng 422; xóa thể loại đang dùng 409; không tồn tại 404', async () => {
    reset();
    await assert.rejects(GenreService.create(admin, { code: 'Có Dấu!', name: 'x' }, 'ip'), (e) => e.statusCode === 422);
    g.dup = true; await assert.rejects(GenreService.create(admin, { code: 'drama', name: 'Chính kịch' }, 'ip'), (e) => e.code === 'GENRE_CODE_TAKEN');
    g.dup = false; const ok = await GenreService.create(admin, { code: 'drama', name: 'Chính kịch' }, 'ip'); assert.equal(ok.code, 'drama');
    g.affected = 0; g.exists = true; await assert.rejects(GenreService.remove(admin, '3', 'ip'), (e) => e.code === 'GENRE_IN_USE');
    g.exists = false; await assert.rejects(GenreService.remove(admin, '3', 'ip'), (e) => e.statusCode === 404);
    g.affected = 1; await GenreService.remove(admin, '3', 'ip'); assert.ok(audit.includes('GENRE_DELETE'));
});

// ------------------------------------------------------------------ FileService (BM8)
mock('src/repositories/fileRepository', { createPoster: async (a) => { calls.push(['poster', a]); return 7; }, findContentById: async () => null });
const FileService = fresh('src/services/fileService');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
test('UT-24 tải ảnh: tệp PHP đổi tên .jpg bị từ chối 415 theo chữ ký; ghi nhật ký; không lưu', async () => {
    reset();
    const fake = Buffer.from('<?php system($_GET["c"]); ?>');
    await assert.rejects(FileService.uploadPoster({ file: { buffer: fake, size: fake.length, originalname: 'anh.jpg' }, titleId: 1, user: { id: 1 }, ip: 'ip' }),
        (e) => e.statusCode === 415 && e.code === 'INVALID_FILE_SIGNATURE');
    assert.equal(lastCall('poster'), undefined); assert.deepEqual(audit, ['UPLOAD_REJECTED']);
});
test('UT-25 tải ảnh: PNG thật được nhận, tên lưu ngẫu nhiên, kiểu do máy chủ xác định; tệp > 2 MB bị 413', async () => {
    reset();
    const out = await FileService.uploadPoster({ file: { buffer: PNG, size: PNG.length, originalname: '../../etc/passwd.php' }, titleId: 1, user: { id: 1 }, ip: 'ip' });
    const saved = lastCall('poster')[1];
    assert.equal(out.mime, 'image/png'); assert.match(saved.storedName, /^[a-f0-9]{32}\.png$/); assert.equal(saved.sha256.length, 64);
    await assert.rejects(FileService.uploadPoster({ file: { buffer: PNG, size: 3 * 1024 * 1024, originalname: 'a.png' }, titleId: 1, user: { id: 1 }, ip: 'ip' }), (e) => e.statusCode === 413);
});

// ------------------------------------------------------------------ StatsService + bộ nhớ đệm
const repoCalls = {};
const countingRepo = new Proxy({}, { get: (t, name) => async () => { repoCalls[name] = (repoCalls[name] || 0) + 1; return /prior/i.test(name) ? 3.5 : []; } });
mock('src/repositories/statsRepository', countingRepo);
mock('src/repositories/ratingRepository', countingRepo);
const cache = require('../../src/utils/cache');
const StatsService = fresh('src/services/statsService');
test('UT-26 đệm xếp hạng: lần 1 MISS, lần 2 HIT (không truy vấn CSDL), sau cache.clear() lại MISS', async () => {
    cache.clear(); Object.keys(repoCalls).forEach((k) => delete repoCalls[k]);
    const a = await StatsService.ranking({ limit: '5' }); const total1 = Object.values(repoCalls).reduce((x, y) => x + y, 0);
    const b = await StatsService.ranking({ limit: '5' }); const total2 = Object.values(repoCalls).reduce((x, y) => x + y, 0);
    assert.equal(a.meta.cache, 'MISS'); assert.equal(b.meta.cache, 'HIT'); assert.equal(total2, total1);
    cache.clear(); assert.equal((await StatsService.ranking({ limit: '5' })).meta.cache, 'MISS');
    assert.equal((await StatsService.ranking({ limit: '6' })).meta.cache, 'MISS'); // khóa đệm khác tham số
});
test('UT-27 xếp hạng: tham số sai trả 422 và không đi vào đệm', async () => {
    await assert.rejects(StatsService.ranking({ limit: '-5' }), (e) => e.statusCode === 422);
});
