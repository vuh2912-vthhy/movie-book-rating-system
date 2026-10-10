'use strict';
const { readInt, invalid } = require('./params');

const KINDS = ['movie', 'book'];
const STATUSES = ['draft', 'published', 'hidden'];
const SORTS = ['rating', 'newest', 'popular', 'title', 'year'];
const ROLES_BY_KIND = { movie: ['director', 'actor', 'writer'], book: ['author'] };
const isString = (v) => typeof v === 'string';
const hasBadChars = (s) => /[<>]/.test(s);

// ---------------------------------------------------------------- danh sách
function validateListQuery(query, { isStaff = false } = {}) {
    const q = query || {};
    const errors = [];
    const filters = { sort: 'rating', status: 'published' };

    const text = (field, max) => {
        if (q[field] === undefined) return undefined;
        if (!isString(q[field])) { errors.push(invalid(field, `${field} không hợp lệ`)); return undefined; }
        const v = q[field].trim();
        if (v.length > max) { errors.push(invalid(field, `${field} tối đa ${max} ký tự`, 'TOO_LONG')); return undefined; }
        return v || undefined;
    };

    filters.keyword = text('keyword', 100);

    const kind = text('kind', 10);
    if (kind !== undefined) {
        if (!KINDS.includes(kind)) errors.push(invalid('kind', `kind phải là ${KINDS.join(' hoặc ')}`));
        else filters.kind = kind;
    }

    const genre = text('genre', 32);
    if (genre !== undefined) {
        if (!/^[a-z0-9_]{1,32}$/.test(genre)) errors.push(invalid('genre', 'genre là mã thể loại (chữ thường, số, gạch dưới)'));
        else filters.genre = genre;
    }

    const yearFrom = readInt(q.yearFrom, 'yearFrom', { min: 1850, max: 2100 });
    const yearTo = readInt(q.yearTo, 'yearTo', { min: 1850, max: 2100 });
    if (yearFrom.error) errors.push(yearFrom.error); else filters.yearFrom = yearFrom.value;
    if (yearTo.error) errors.push(yearTo.error); else filters.yearTo = yearTo.value;
    if (filters.yearFrom && filters.yearTo && filters.yearFrom > filters.yearTo) {
        errors.push(invalid('yearFrom', 'yearFrom không được lớn hơn yearTo', 'OUT_OF_RANGE'));
    }

    const sort = text('sort', 16);
    if (sort !== undefined) {
        if (!SORTS.includes(sort)) errors.push(invalid('sort', `sort phải là một trong: ${SORTS.join(', ')}`));
        else filters.sort = sort;
    }

    // Chỉ nhân viên (có quyền title.update) được xem bản nháp / đã ẩn; người khác luôn chỉ thấy "published".
    if (isStaff && q.status !== undefined) {
        const status = text('status', 12);
        if (status !== undefined) {
            if (status !== 'all' && !STATUSES.includes(status)) errors.push(invalid('status', 'status không hợp lệ'));
            else filters.status = status;
        }
    }
    return { errors, filters };
}

// ------------------------------------------------------- tạo / sửa tác phẩm
function validateTitleInput(body, { existingKind } = {}) {
    const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const errors = [];
    const value = {};

    value.kind = b.kind === undefined && existingKind ? existingKind : b.kind;
    if (!KINDS.includes(value.kind)) errors.push(invalid('kind', `kind phải là ${KINDS.join(' hoặc ')}`));
    else if (existingKind && value.kind !== existingKind) {
        errors.push(invalid('kind', 'Không được đổi loại tác phẩm (phim/sách) sau khi tạo', 'IMMUTABLE'));
    }

    const title = isString(b.title) ? b.title.trim().replace(/\s+/g, ' ') : '';
    if (!title) errors.push(invalid('title', 'Tiêu đề không được để trống', 'REQUIRED'));
    else if (title.length > 200) errors.push(invalid('title', 'Tiêu đề tối đa 200 ký tự', 'TOO_LONG'));
    else if (hasBadChars(title)) errors.push(invalid('title', 'Tiêu đề không được chứa ký tự < hoặc >', 'INVALID_CHARS'));
    value.title = title;

    if (b.originalTitle === undefined || b.originalTitle === null || b.originalTitle === '') {
        value.originalTitle = null;
    } else if (!isString(b.originalTitle) || b.originalTitle.trim().length > 200 || hasBadChars(b.originalTitle)) {
        errors.push(invalid('originalTitle', 'Tên gốc không hợp lệ (tối đa 200 ký tự, không chứa < >)'));
    } else {
        value.originalTitle = b.originalTitle.trim();
    }

    const year = Number.isInteger(b.releaseYear) ? b.releaseYear : NaN;
    if (!(year >= 1850 && year <= 2100)) errors.push(invalid('releaseYear', 'releaseYear phải là số nguyên từ 1850 đến 2100'));
    value.releaseYear = year;

    value.runtimeMin = null;
    value.pageCount = null;
    if (value.kind === 'movie') {
        if (!(Number.isInteger(b.runtimeMin) && b.runtimeMin >= 1 && b.runtimeMin <= 1000)) {
            errors.push(invalid('runtimeMin', 'Phim cần runtimeMin là số nguyên từ 1 đến 1000 (phút)', 'REQUIRED'));
        } else value.runtimeMin = b.runtimeMin;
        if (b.pageCount !== undefined && b.pageCount !== null) errors.push(invalid('pageCount', 'Phim không có pageCount'));
    } else if (value.kind === 'book') {
        if (!(Number.isInteger(b.pageCount) && b.pageCount >= 1 && b.pageCount <= 20000)) {
            errors.push(invalid('pageCount', 'Sách cần pageCount là số nguyên từ 1 đến 20000', 'REQUIRED'));
        } else value.pageCount = b.pageCount;
        if (b.runtimeMin !== undefined && b.runtimeMin !== null) errors.push(invalid('runtimeMin', 'Sách không có runtimeMin'));
    }

    if (b.synopsis === undefined || b.synopsis === null || b.synopsis === '') value.synopsis = null;
    else if (!isString(b.synopsis) || b.synopsis.length > 5000) errors.push(invalid('synopsis', 'Tóm tắt tối đa 5000 ký tự'));
    else value.synopsis = b.synopsis.trim();

    value.status = b.status === undefined ? 'published' : b.status;
    if (!STATUSES.includes(value.status)) errors.push(invalid('status', `status phải là một trong: ${STATUSES.join(', ')}`));

    const ids = b.genreIds;
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5 || !ids.every((x) => Number.isInteger(x) && x > 0)) {
        errors.push(invalid('genreIds', 'genreIds phải là mảng 1 đến 5 mã thể loại (số nguyên dương)'));
    } else if (new Set(ids).size !== ids.length) {
        errors.push(invalid('genreIds', 'genreIds không được trùng nhau', 'DUPLICATE'));
    } else value.genreIds = ids;

    value.credits = [];
    if (b.credits !== undefined && b.credits !== null) {
        if (!Array.isArray(b.credits) || b.credits.length > 30) {
            errors.push(invalid('credits', 'credits phải là mảng tối đa 30 phần tử'));
        } else {
            const seen = new Set();
            b.credits.forEach((c, i) => {
                const f = `credits[${i}]`;
                const okShape = c && typeof c === 'object' && Number.isInteger(c.personId) && c.personId > 0;
                const allowed = ROLES_BY_KIND[value.kind] || [];
                if (!okShape) return errors.push(invalid(f, 'Mỗi phần tử cần personId là số nguyên dương'));
                if (!allowed.includes(c.role)) {
                    return errors.push(invalid(`${f}.role`, `role của ${value.kind || 'tác phẩm'} phải là: ${allowed.join(', ')}`));
                }
                const order = c.order === undefined ? 1 : c.order;
                if (!(Number.isInteger(order) && order >= 1 && order <= 50)) {
                    return errors.push(invalid(`${f}.order`, 'order phải là số nguyên từ 1 đến 50'));
                }
                const key = `${c.personId}:${c.role}`;
                if (seen.has(key)) return errors.push(invalid(f, 'Trùng (personId, role)', 'DUPLICATE'));
                seen.add(key);
                return value.credits.push({ personId: c.personId, role: c.role, order });
            });
        }
    }
    return { errors, value };
}

function validateRatingInput(body) {
    const b = body && typeof body === 'object' ? body : {};
    const errors = [];
    if (!(Number.isInteger(b.score) && b.score >= 1 && b.score <= 5)) {
        errors.push(invalid('score', 'score phải là số nguyên từ 1 đến 5', 'OUT_OF_RANGE'));
    }
    return { errors, value: { score: b.score } };
}

module.exports = { validateListQuery, validateTitleInput, validateRatingInput, KINDS, STATUSES, SORTS };
