'use strict';
const HttpError = require('../utils/httpError');
const { parseId } = require('../utils/params');
const { validateGenre } = require('../utils/accountValidators');
const GenreRepository = require('../repositories/genreRepository');
const AuditLogService = require('./auditLogService');
const cache = require('../utils/cache');

const toDto = (g) => ({ id: g.id, code: g.code, name: g.name, appliesTo: g.applies_to });
const notFound = () => HttpError.notFound('Không tìm thấy thể loại', 'GENRE_NOT_FOUND');
const dup = () => HttpError.conflict('Mã thể loại đã tồn tại', 'GENRE_CODE_TAKEN');

class GenreService {
    static async list() {
        const rows = await GenreRepository.findAll();
        return rows.map(toDto);
    }

    static async create(user, body, ip) {
        const { errors, value } = validateGenre(body);
        if (errors.length) throw HttpError.unprocessable('Thể loại không hợp lệ', errors);
        let id;
        try { id = await GenreRepository.create(value); }
        catch (e) { if (e && e.code === 'ER_DUP_ENTRY') throw dup(); throw e; }
        await AuditLogService.logAction(user.id, 'GENRE_CREATE', 'genres', id, ip);
        cache.clear();
        return toDto(await GenreRepository.findById(id));
    }

    static async update(user, idRaw, body, ip) {
        const id = parseId(idRaw);
        const { errors, value } = validateGenre(body);
        if (errors.length) throw HttpError.unprocessable('Thể loại không hợp lệ', errors);
        if (!(await GenreRepository.findById(id))) throw notFound();
        try { await GenreRepository.update(id, value); }
        catch (e) { if (e && e.code === 'ER_DUP_ENTRY') throw dup(); throw e; }
        await AuditLogService.logAction(user.id, 'GENRE_UPDATE', 'genres', id, ip);
        cache.clear();
        return toDto(await GenreRepository.findById(id));
    }

    static async remove(user, idRaw, ip) {
        const id = parseId(idRaw);
        let affected;
        try { affected = await GenreRepository.deleteIfUnused(id); }
        catch (e) { if (e && e.code === 'ER_ROW_IS_REFERENCED_2') throw HttpError.conflict('Thể loại đang được dùng', 'GENRE_IN_USE'); throw e; }
        if (!affected) {
            if (!(await GenreRepository.findById(id))) throw notFound();
            throw HttpError.conflict('Thể loại đang được tác phẩm sử dụng, không thể xóa', 'GENRE_IN_USE');
        }
        await AuditLogService.logAction(user.id, 'GENRE_DELETE', 'genres', id, ip);
        cache.clear();
    }
}

module.exports = GenreService;
