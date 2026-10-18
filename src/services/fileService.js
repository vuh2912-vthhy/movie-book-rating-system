'use strict';
// BM8: tải tệp an toàn. Kiểu tệp xác định theo chữ ký (magic bytes), không tin phần mở rộng hay Content-Type.
const crypto = require('crypto');
const FileType = require('file-type');
const HttpError = require('../utils/httpError');
const FileRepository = require('../repositories/fileRepository');
const AuditLogService = require('./auditLogService');

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

class FileService {
    static async uploadPoster({ file, titleId, user, ip }) {
        if (!Number.isInteger(titleId) || titleId <= 0) throw HttpError.badRequest('Mã tác phẩm không hợp lệ');
        if (!file || !file.buffer || !file.buffer.length) {
            throw HttpError.unprocessable('Chưa chọn tệp ảnh', [{ field: 'file', issue: 'Bắt buộc' }], 'FILE_REQUIRED');
        }
        if (file.size > MAX_BYTES) throw new HttpError(413, 'FILE_TOO_LARGE', 'Tệp vượt quá 2 MB');

        const detected = await FileType.fromBuffer(file.buffer);   // đọc chữ ký thật của tệp
        if (!detected || !ALLOWED[detected.mime]) {
            await AuditLogService.logAction(user.id, 'UPLOAD_REJECTED', 'files', null, ip);
            throw new HttpError(415, 'INVALID_FILE_SIGNATURE', 'Chữ ký tệp không phải ảnh JPG/PNG/WEBP hợp lệ');
        }

        const storedName = `${crypto.randomBytes(16).toString('hex')}.${ALLOWED[detected.mime]}`; // đặt lại tên ngẫu nhiên
        const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
        const id = await FileRepository.createPoster({
            ownerId: user.id, titleId,
            originalName: String(file.originalname || 'poster').slice(0, 255),
            storedName, mime: detected.mime, size: file.buffer.length, sha256, content: file.buffer
        });
        if (!id) throw HttpError.notFound('Không tìm thấy tác phẩm', 'TITLE_NOT_FOUND');

        await AuditLogService.logAction(user.id, 'POSTER_UPLOAD', 'files', id, ip);
        return { id, url: `/api/v1/files/${id}`, mime: detected.mime, size: file.buffer.length };
    }

    static async getPoster(id) {
        if (!Number.isInteger(id) || id <= 0) throw HttpError.badRequest('Mã tệp không hợp lệ');
        const row = await FileRepository.findContentById(id);
        if (!row || !row.content) throw HttpError.notFound('Không tìm thấy tệp', 'FILE_NOT_FOUND');
        return row;
    }
}

module.exports = FileService;
