'use strict';
const HttpError = require('../utils/httpError');

const notFoundHandler = (req, res, next) => {
    const path = req.originalUrl.split('?')[0];
    next(HttpError.notFound(`Không tìm thấy ${req.method} ${path}`));
};

const LEGACY_CODES = { 400: 'BAD_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'VALIDATION_FAILED' };

const errorHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);

    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Lỗi hệ thống. Vui lòng thử lại sau.';
    let details = [];

    if (err instanceof HttpError) {
        ({ statusCode: status, code, message } = err);
        details = err.details || [];
    } else if (err && err.type === 'entity.parse.failed') {
        status = 400; code = 'INVALID_JSON'; message = 'Nội dung JSON không hợp lệ';
    } else if (err && err.type === 'entity.too.large') {
        status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Dữ liệu gửi lên quá lớn';
    } else if (err && err.code === 'LIMIT_FILE_SIZE') {
        status = 413; code = 'FILE_TOO_LARGE'; message = 'Tệp vượt quá dung lượng cho phép';
    } else if (err && typeof err.code === 'string' && err.code.startsWith('LIMIT_')) {
        status = 400; code = 'UPLOAD_ERROR'; message = 'Yêu cầu tải tệp không hợp lệ';
    } else if (err && Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 500) {
        status = err.statusCode; code = LEGACY_CODES[status] || 'BAD_REQUEST'; message = err.message;
    }

    if (status >= 500) {
        console.error(`[error] ${req.id || '-'} ${req.method} ${req.originalUrl}`, (err && err.stack) || err);
    }

    res.status(status).json({ success: false, error: { code, message, details, requestId: req.id } });
};

module.exports = { notFoundHandler, errorHandler };
