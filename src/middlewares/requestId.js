'use strict';
const crypto = require('crypto');
// Gắn mã định danh cho mỗi yêu cầu: trả trong tiêu đề X-Request-Id và trong phản hồi lỗi, ghi vào nhật ký lỗi,
// để đối chiếu một phản hồi lỗi với dòng nhật ký phía máy chủ mà không lộ chi tiết nội bộ (BM9).
const requestId = (req, res, next) => {
    const incoming = req.headers['x-request-id'];
    req.id = typeof incoming === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
};
module.exports = requestId;
