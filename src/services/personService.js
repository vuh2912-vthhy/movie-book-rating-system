'use strict';
const HttpError = require('../utils/httpError');
const { parseId, parsePagination, buildPagination } = require('../utils/params');
const { validatePerson } = require('../utils/accountValidators');
const PersonRepository = require('../repositories/personRepository');
const AuditLogService = require('./auditLogService');

const toDto = (p) => ({ id: p.id, fullName: p.full_name, birthYear: p.birth_year, country: p.country });
const notFound = () => HttpError.notFound('Không tìm thấy nhân vật', 'PERSON_NOT_FOUND');

class PersonService {
    static async list(query) {
        const q = typeof query.q === 'string' ? query.q.trim() : '';
        if (q.length > 100) throw HttpError.unprocessable('Từ khóa tối đa 100 ký tự', [{ field: 'q', code: 'TOO_LONG', message: 'Tối đa 100 ký tự' }]);
        const pg = parsePagination(query, { defaultSize: 20, maxSize: 50 });
        const { rows, total } = await PersonRepository.listPaginated({ q }, pg.size, pg.offset);
        return { items: rows.map(toDto), pagination: buildPagination(pg, total) };
    }

    static async getById(idRaw) {
        const p = await PersonRepository.findById(parseId(idRaw));
        if (!p) throw notFound();
        return toDto(p);
    }

    static async create(user, body, ip) {
        const { errors, value } = validatePerson(body);
        if (errors.length) throw HttpError.unprocessable('Nhân vật không hợp lệ', errors);
        const id = await PersonRepository.create(value);
        await AuditLogService.logAction(user.id, 'PERSON_CREATE', 'persons', id, ip);
        return toDto(await PersonRepository.findById(id));
    }

    static async update(user, idRaw, body, ip) {
        const id = parseId(idRaw);
        const { errors, value } = validatePerson(body);
        if (errors.length) throw HttpError.unprocessable('Nhân vật không hợp lệ', errors);
        if (!(await PersonRepository.findById(id))) throw notFound();
        await PersonRepository.update(id, value);
        await AuditLogService.logAction(user.id, 'PERSON_UPDATE', 'persons', id, ip);
        return toDto(await PersonRepository.findById(id));
    }
}

module.exports = PersonService;
