'use strict';

// Lỗi nghiệp vụ có mã HTTP và mã lỗi máy đọc được.
// Tầng xử lý lỗi tập trung chuyển thành: { success:false, error:{ code, message, details } }
class HttpError extends Error {
    constructor(statusCode, code, message, details = []) {
        super(message);
        this.name = 'HttpError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }

    static badRequest(message = 'Yêu cầu không hợp lệ', details = [], code = 'BAD_REQUEST') {
        return new HttpError(400, code, message, details);
    }

    static unauthorized(message = 'Chưa đăng nhập', code = 'UNAUTHENTICATED') {
        return new HttpError(401, code, message);
    }

    static forbidden(message = 'Bạn không có quyền thực hiện thao tác này', code = 'FORBIDDEN') {
        return new HttpError(403, code, message);
    }

    static notFound(message = 'Không tìm thấy tài nguyên', code = 'NOT_FOUND') {
        return new HttpError(404, code, message);
    }

    static conflict(message = 'Dữ liệu xung đột', code = 'CONFLICT') {
        return new HttpError(409, code, message);
    }

    static unprocessable(message = 'Dữ liệu không hợp lệ', details = [], code = 'VALIDATION_FAILED') {
        return new HttpError(422, code, message, details);
    }

    static tooManyRequests(message = 'Quá nhiều yêu cầu', code = 'TOO_MANY_REQUESTS') {
        return new HttpError(429, code, message);
    }
}

module.exports = HttpError;
