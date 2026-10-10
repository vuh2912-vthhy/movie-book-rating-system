'use strict';

// "Ký ức Mùa Thu" -> "ky uc mua thu": dùng cho cột titles.title_search để tìm có dấu / không dấu
const stripAccents = (text) =>
    String(text)
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

// Thoát ký tự đặc biệt của LIKE để từ khóa "50%" hay "a_b" được hiểu theo nghĩa đen
const escapeLike = (text) => String(text).replace(/[\\%_]/g, (ch) => `\\${ch}`);

const normalizeSearchText = (...parts) =>
    stripAccents(parts.filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();

module.exports = { stripAccents, escapeLike, normalizeSearchText };
