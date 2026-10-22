'use strict';

const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value, delimiter = ',') {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    let text = String(value);
    if (FORMULA_START.test(text)) text = `'${text}`;
    if (text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text)) {
        text = `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function toCsv(headers, rows, { delimiter = ',', bom = true } = {}) {
    const lines = [headers, ...rows].map((r) => r.map((v) => cell(v, delimiter)).join(delimiter));
    return (bom ? '\uFEFF' : '') + lines.join('\r\n') + '\r\n';
}

// Bộ đọc CSV (dùng trong kiểm thử để chứng minh xuất ra rồi đọc lại đúng dữ liệu)
function parseCsv(text, delimiter = ',') {
    const src = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < src.length; i += 1) {
        const ch = src[i];
        if (quoted) {
            if (ch === '"') {
                if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
            } else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === delimiter) { row.push(field); field = ''; }
        else if (ch === '\r') { /* bỏ qua, xử lý ở \n */ }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
}

module.exports = { cell, toCsv, parseCsv };
