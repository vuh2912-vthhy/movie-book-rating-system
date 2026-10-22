'use strict';
const { invalid, readInt } = require('./params');

const REPORT_REASONS = ['spam', 'offensive', 'spoiler', 'off_topic', 'other'];
const MODERATE_ACTIONS = ['approve', 'reject', 'hide', 'restore'];
const HANDLE_DECISIONS = ['resolve', 'dismiss'];
const LIST_TYPES = ['want', 'watching', 'done'];
const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'hidden'];
const REPORT_STATUSES = ['open', 'resolved', 'dismissed'];
const REVIEW_SORTS = ['newest', 'helpful'];
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const isString = (v) => typeof v === 'string';
const obj = (b) => (b && typeof b === 'object' && !Array.isArray(b) ? b : {});

function optionalText(value, field, max, errors) {
    if (value === undefined || value === null || value === '') return null;
    if (!isString(value) || value.trim().length > max || CONTROL_CHARS.test(value)) {
        errors.push(invalid(field, `${field} phải là chuỗi tối đa ${max} ký tự`));
        return null;
    }
    return value.trim();
}

// Nội dung bình luận được lưu nguyên văn; việc mã hóa khi hiển thị (chống XSS) thực hiện ở tầng giao diện
function validateReviewBody(body) {
    const b = obj(body);
    const errors = [];
    const text = isString(b.body) ? b.body.replace(/\r\n/g, '\n').trim() : '';
    if (!text) errors.push(invalid('body', 'Nội dung bình luận không được để trống', 'REQUIRED'));
    else if (text.length < 10) errors.push(invalid('body', 'Bình luận phải có ít nhất 10 ký tự', 'TOO_SHORT'));
    else if (text.length > 2000) errors.push(invalid('body', 'Bình luận tối đa 2000 ký tự', 'TOO_LONG'));
    else if (CONTROL_CHARS.test(text)) errors.push(invalid('body', 'Nội dung chứa ký tự điều khiển không hợp lệ', 'INVALID_CHARS'));
    return { errors, value: { body: text } };
}

function validateModerate(body) {
    const b = obj(body);
    const errors = [];
    if (!MODERATE_ACTIONS.includes(b.action)) errors.push(invalid('action', `action phải là một trong: ${MODERATE_ACTIONS.join(', ')}`));
    const note = optionalText(b.note, 'note', 200, errors);
    return { errors, value: { action: b.action, note } };
}

function validateVote(body) {
    const b = obj(body);
    const errors = [];
    if (b.vote !== 1 && b.vote !== -1) errors.push(invalid('vote', 'vote phải là 1 (hữu ích) hoặc -1 (không hữu ích)', 'OUT_OF_RANGE'));
    return { errors, value: { vote: b.vote } };
}

function validateReport(body) {
    const b = obj(body);
    const errors = [];
    if (!REPORT_REASONS.includes(b.reason)) errors.push(invalid('reason', `reason phải là một trong: ${REPORT_REASONS.join(', ')}`));
    const detail = optionalText(b.detail, 'detail', 500, errors);
    return { errors, value: { reason: b.reason, detail } };
}

function validateHandle(body) {
    const b = obj(body);
    const errors = [];
    if (!HANDLE_DECISIONS.includes(b.decision)) errors.push(invalid('decision', `decision phải là một trong: ${HANDLE_DECISIONS.join(', ')}`));
    return { errors, value: { decision: b.decision } };
}

function validateWatchlist(body) {
    const b = obj(body);
    const errors = [];
    if (!LIST_TYPES.includes(b.listType)) errors.push(invalid('listType', `listType phải là một trong: ${LIST_TYPES.join(', ')}`));
    return { errors, value: { listType: b.listType } };
}

// Tham số lọc dạng liệt kê (status, sort, listType)
function validateEnumQuery(query, field, allowed, defaultValue) {
    const raw = (query || {})[field];
    if (raw === undefined || raw === '') return { value: defaultValue };
    if (typeof raw !== 'string' || !allowed.includes(raw)) {
        return { error: invalid(field, `${field} phải là một trong: ${allowed.join(', ')}`) };
    }
    return { value: raw };
}

function validateBoolQuery(query, field) {
    const raw = (query || {})[field];
    if (raw === undefined || raw === '') return { value: false };
    if (raw !== 'true' && raw !== 'false') return { error: invalid(field, `${field} phải là true hoặc false`) };
    return { value: raw === 'true' };
}

module.exports = {
    validateReviewBody, validateModerate, validateVote, validateReport, validateHandle, validateWatchlist,
    validateEnumQuery, validateBoolQuery, readInt,
    REPORT_REASONS, MODERATE_ACTIONS, HANDLE_DECISIONS, LIST_TYPES, REVIEW_STATUSES, REPORT_STATUSES, REVIEW_SORTS
};
