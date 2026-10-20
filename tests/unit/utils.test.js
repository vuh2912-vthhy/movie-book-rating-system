'use strict';
require('./_setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { average2, weightedScore } = require('../../src/utils/rankingMath');
const { escapeLike, stripAccents, normalizeSearchText } = require('../../src/utils/text');
const { cell, toCsv, parseCsv } = require('../../src/utils/csv');
const { parseId, parsePagination, buildPagination } = require('../../src/utils/params');
const { TtlCache } = require('../../src/utils/cache');

test('UT-01 weightedScore: tác phẩm chưa có lượt chấm nhận đúng điểm trung bình toàn hệ thống', () => {
    assert.equal(weightedScore(0, 0, 25, 3.5), 3.5);
});
test('UT-02 weightedScore: 1 lượt 5 sao xếp thấp hơn 1000 lượt trung bình 4,5 (Bảng 3.12)', () => {
    const a = weightedScore(5, 1, 25, 3.5); const b = weightedScore(4500, 1000, 25, 3.5);
    assert.equal(a, 3.5577); assert.equal(b, 4.4756); assert.ok(b > a);
});
test('UT-03 weightedScore: nhiều lượt chấm thì tiến về điểm trung bình của chính tác phẩm', () => {
    assert.ok(Math.abs(weightedScore(5 * 100000, 100000, 25, 1) - 5) < 0.01);
});
test('UT-04 average2: làm tròn nửa lên kiểu ROUND của MySQL, rỗng khi chưa có lượt chấm', () => {
    assert.equal(average2(0, 0), null); assert.equal(average2(10, 3), 3.33); assert.equal(average2(2, 3), 0.67); assert.equal(average2(1, 8), 0.13);
});
test('UT-05 escapeLike thoát %, _ và \\ để không thành ký tự đại diện', () => {
    assert.equal(escapeLike('50%_off\\x'), '50\\%\\_off\\\\x');
});
test('UT-06 tìm kiếm không dấu: stripAccents và normalizeSearchText', () => {
    assert.equal(stripAccents('Đại Học Phenikaa'), 'dai hoc phenikaa');
    assert.equal(normalizeSearchText('  Chiến  Tranh  '), 'chien tranh');
});
test('UT-07 CSV: trường chứa dấu phẩy, nháy kép, xuống dòng được bọc; chống công thức Excel', () => {
    assert.equal(cell('a,b'), '"a,b"'); assert.equal(cell('nói "hay"'), '"nói ""hay"""');
    assert.ok(cell('=1+1').startsWith("'") || cell('=1+1').startsWith('"\''));
    const csv = toCsv(['id', 'tên'], [[1, 'a,b'], [2, 'dòng\n2']]);
    assert.ok(csv.startsWith('\uFEFF'));
    assert.deepEqual(parseCsv(csv), [['id', 'tên'], ['1', 'a,b'], ['2', 'dòng\n2']]);
});
test('UT-08 parseId: chỉ nhận số nguyên dương, ngược lại ném 422', () => {
    assert.equal(parseId('12'), 12);
    for (const bad of ['0', '-1', 'abc', '1 OR 1=1', '1.5', '']) assert.throws(() => parseId(bad), (e) => e.statusCode === 422, bad);
});
test('UT-09 parsePagination: cắt kích thước trang về trần, sai kiểu thì 422', () => {
    assert.equal(parsePagination({ size: '1000000' }, { maxSize: 50 }).size, 50);
    assert.deepEqual(parsePagination({ page: '3', size: '10' }), { page: 3, size: 10, offset: 20 });
    assert.throws(() => parsePagination({ page: '0' }), (e) => e.statusCode === 422);
    assert.deepEqual(buildPagination({ page: 1, size: 10 }, 25), { page: 1, size: 10, total: 25, totalPages: 3 });
});
test('UT-10 TtlCache: HIT trong TTL, MISS sau khi clear, loại mục cũ khi quá giới hạn', async () => {
    const c = new TtlCache({ max: 2 }); let calls = 0; const load = async () => { calls += 1; return calls; };
    assert.equal((await c.getOrSet('a', 1000, load)).hit, false);
    assert.equal((await c.getOrSet('a', 1000, load)).hit, true); assert.equal(calls, 1);
    c.clear(); assert.equal((await c.getOrSet('a', 1000, load)).hit, false);
    await c.getOrSet('b', 1000, load); await c.getOrSet('c', 1000, load); assert.equal(c.stats().size, 2);
});
test('UT-11 TtlCache: hết TTL thì tính lại', async () => {
    const c = new TtlCache(); let n = 0;
    await c.getOrSet('k', 5, async () => ++n); await new Promise((r) => setTimeout(r, 20));
    assert.equal((await c.getOrSet('k', 5, async () => ++n)).hit, false); assert.equal(n, 2);
});
