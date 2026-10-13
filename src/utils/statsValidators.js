'use strict';
const { readInt, invalid } = require('./params');

const SOURCES = ['aggregate', 'live'];
const KINDS = ['movie', 'book'];
const GRANULARITIES = ['month', 'day'];
const REPORTS = ['genres', 'timeline', 'ranking', 'catalog', 'overview'];
const FORMATS = ['csv', 'xlsx'];
const DELIMITERS = { comma: ',', semicolon: ';' };

const text = (q, f, max, errors) => {
    const raw = q[f];
    if (raw === undefined || raw === '') return undefined;
    if (typeof raw !== 'string' || raw.length > max) { errors.push(invalid(f, `${f} không hợp lệ`)); return undefined; }
    return raw.trim();
};
const oneOf = (q, f, allowed, def, errors) => {
    const v = text(q, f, 20, errors);
    if (v === undefined) return def;
    if (!allowed.includes(v)) { errors.push(invalid(f, `${f} phải là một trong: ${allowed.join(', ')}`)); return def; }
    return v;
};
const genreCode = (q, errors) => {
    const v = text(q, 'genre', 32, errors);
    if (v === undefined) return undefined;
    if (!/^[a-z0-9_]{1,32}$/.test(v)) { errors.push(invalid('genre', 'genre là mã thể loại (chữ thường, số, gạch dưới)')); return undefined; }
    return v;
};
const int = (q, f, min, max, def, errors) => {
    const r = readInt(q[f], f, { min, max, defaultValue: def });
    if (r.error) { errors.push(r.error); return def; }
    return r.value;
};

function validateRanking(query) {
    const q = query || {}; const errors = [];
    const value = {
        source: oneOf(q, 'source', SOURCES, 'aggregate', errors),
        kind: oneOf(q, 'kind', KINDS, undefined, errors),
        genre: genreCode(q, errors),
        limit: int(q, 'limit', 1, 50, 10, errors)
    };
    return { errors, value };
}

function validateGenres(query) {
    const q = query || {}; const errors = [];
    return { errors, value: { kind: oneOf(q, 'kind', KINDS, undefined, errors) } };
}

function validateTimeline(query) {
    const q = query || {}; const errors = [];
    const granularity = oneOf(q, 'granularity', GRANULARITIES, 'month', errors);
    return {
        errors,
        value: {
            granularity,
            months: int(q, 'months', 1, 36, 12, errors),
            days: int(q, 'days', 1, 90, 30, errors),
            kind: oneOf(q, 'kind', KINDS, undefined, errors)
        }
    };
}

function validateExport(query) {
    const q = query || {}; const errors = [];
    const report = oneOf(q, 'report', REPORTS, undefined, errors);
    if (!report && !errors.length) errors.push(invalid('report', `report là bắt buộc, một trong: ${REPORTS.join(', ')}`, 'REQUIRED'));
    const format = oneOf(q, 'format', FORMATS, 'csv', errors);
    const delimiterName = oneOf(q, 'delimiter', Object.keys(DELIMITERS), 'comma', errors);
    return {
        errors,
        value: { report, format, delimiter: DELIMITERS[delimiterName], ranking: validateRanking(q).value, timeline: validateTimeline(q).value, kind: oneOf(q, 'kind', KINDS, undefined, []) }
    };
}

// Ngày 'YYYY-MM-DD' hoặc 'YYYY-MM-DDTHH:MM[:SS]' (UTC) -> 'YYYY-MM-DD HH:MM:SS'; kiểm tra ngày có thật (không có 31/02)
function parseDate(raw, endOfDay) {
    if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/.test(raw)) return null;
    let norm = raw.replace('T', ' ');
    if (norm.length === 10) norm += endOfDay ? ' 23:59:59' : ' 00:00:00';
    else if (norm.length === 16) norm += ':00';
    const d = new Date(`${norm.replace(' ', 'T')}Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 19).replace('T', ' ') !== norm) return null;
    return norm;
}

function validateLogQuery(query) {
    const q = query || {}; const errors = [];
    const value = {};
    if (q.userId !== undefined && q.userId !== '') {
        const r = readInt(q.userId, 'userId', { min: 1, max: 999999999 });
        if (r.error) errors.push(r.error); else value.userId = r.value;
    }
    const action = text(q, 'action', 40, errors);
    if (action !== undefined) { if (!/^[A-Z][A-Z_]{1,39}$/.test(action)) errors.push(invalid('action', 'action gồm chữ hoa và gạch dưới, ví dụ LOGIN_FAILED')); else value.action = action; }
    const entity = text(q, 'entity', 40, errors);
    if (entity !== undefined) { if (!/^[a-z_]{2,40}$/.test(entity)) errors.push(invalid('entity', 'entity là tên bảng chữ thường, ví dụ reviews')); else value.entity = entity; }
    const ip = text(q, 'ip', 45, errors);
    if (ip !== undefined) { if (!/^[0-9a-fA-F:.]{3,45}$/.test(ip)) errors.push(invalid('ip', 'ip không hợp lệ')); else value.ip = ip; }
    const from = text(q, 'from', 19, errors);
    if (from !== undefined) { const d = parseDate(from, false); if (!d) errors.push(invalid('from', 'from phải là YYYY-MM-DD hoặc YYYY-MM-DDTHH:MM:SS (ngày có thật)')); else value.from = d; }
    const to = text(q, 'to', 19, errors);
    if (to !== undefined) { const d = parseDate(to, true); if (!d) errors.push(invalid('to', 'to phải là YYYY-MM-DD hoặc YYYY-MM-DDTHH:MM:SS (ngày có thật)')); else value.to = d; }
    if (value.from && value.to && value.from > value.to) errors.push(invalid('from', 'from không được sau to', 'OUT_OF_RANGE'));
    return { errors, value };
}

module.exports = { validateRanking, validateGenres, validateTimeline, validateExport, validateLogQuery, parseDate, REPORTS, FORMATS, SOURCES };
