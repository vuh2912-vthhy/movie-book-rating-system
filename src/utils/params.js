'use strict';
const HttpError = require('./httpError');

const DIGITS = /^\d{1,15}$/;

const invalid = (field, message, code = 'INVALID') => ({ field, code, message });

function parseId(value, field = 'id') {
    const text = typeof value === 'string' ? value : '';
    const id = DIGITS.test(text) ? Number(text) : 0;
    if (!id) {
        throw HttpError.unprocessable(`${field} không hợp lệ`, [invalid(field, `${field} phải là số nguyên dương`)]);
    }
    return id;
}

function readInt(raw, field, { min, max, defaultValue }) {
    if (raw === undefined || raw === '') return { value: defaultValue };
    if (typeof raw !== 'string' || !/^-?\d{1,9}$/.test(raw)) {
        return { error: invalid(field, `${field} phải là số nguyên`) };
    }
    const value = Number(raw);
    if (value < min || value > max) {
        return { error: invalid(field, `${field} phải nằm trong khoảng ${min} đến ${max}`, 'OUT_OF_RANGE') };
    }
    return { value };
}

function parsePagination(query, { defaultSize = 10, maxSize = 50 } = {}) {
    const q = query || {};
    const errors = [];
    const page = readInt(q.page, 'page', { min: 1, max: 100000, defaultValue: 1 });
    const size = readInt(q.size, 'size', { min: 1, max: 1000000, defaultValue: defaultSize });
    if (page.error) errors.push(page.error);
    if (size.error) errors.push(size.error);
    if (errors.length) throw HttpError.unprocessable('Tham số phân trang không hợp lệ', errors);

    const limit = Math.min(size.value, maxSize);
    return { page: page.value, size: limit, offset: (page.value - 1) * limit };
}

const buildPagination = ({ page, size }, total) => ({
    page,
    size,
    total,
    totalPages: Math.max(1, Math.ceil(total / size))
});

module.exports = { parseId, readInt, parsePagination, buildPagination, invalid };
