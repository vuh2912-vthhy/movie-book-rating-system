'use strict';
const HttpError = require('../utils/httpError');
const { parseId, parsePagination, buildPagination, invalid } = require('../utils/params');
const { validateListQuery, validateTitleInput } = require('../utils/titleValidators');
const ranking = require('../config/ranking');
const TitleRepository = require('../repositories/titleRepository');
const GenreRepository = require('../repositories/genreRepository');
const PersonRepository = require('../repositories/personRepository');
const RatingRepository = require('../repositories/ratingRepository');
const AuditLogService = require('./auditLogService');

const isStaff = (user) => Boolean(user && user.permissions.includes('title.update'));

const toStats = (row) => ({
    ratingCount: Number(row.rating_count || 0),
    ratingAvg: row.rating_avg === null || row.rating_avg === undefined ? null : Number(row.rating_avg),
    weightedScore: Number(row.weighted_score || 0),
    reviewCount: Number(row.review_count || 0)
});

const toListItem = (row, genres, staff) => ({
    id: row.id,
    code: row.code,
    kind: row.kind,
    title: row.title,
    originalTitle: row.original_title,
    releaseYear: row.release_year,
    runtimeMin: row.runtime_min,
    pageCount: row.page_count,
    posterPath: row.poster_path,
    ...(staff ? { status: row.status } : {}),
    genres: genres.map((g) => ({ code: g.code, name: g.name })),
    stats: toStats(row)
});

// Thể loại phải tồn tại và phù hợp loại tác phẩm; người (diễn viên, tác giả...) phải tồn tại.
async function checkReferences(value) {
    const errors = [];
    const genres = await GenreRepository.findByIds(value.genreIds);
    const found = new Map(genres.map((g) => [g.id, g]));
    value.genreIds.forEach((id) => {
        const genre = found.get(id);
        if (!genre) errors.push(invalid('genreIds', `Không có thể loại id ${id}`, 'NOT_FOUND'));
        else if (genre.applies_to !== 'both' && genre.applies_to !== value.kind) {
            errors.push(invalid('genreIds', `Thể loại "${genre.name}" không áp dụng cho ${value.kind}`, 'INCOMPATIBLE'));
        }
    });

    const personIds = [...new Set(value.credits.map((c) => c.personId))];
    const existing = new Set(await PersonRepository.findExistingIds(personIds));
    personIds.filter((id) => !existing.has(id)).forEach((id) => {
        errors.push(invalid('credits', `Không có người id ${id}`, 'NOT_FOUND'));
    });

    if (errors.length) throw HttpError.unprocessable('Dữ liệu tham chiếu không hợp lệ', errors);
}

class TitleService {
    static async list(query, user) {
        const staff = isStaff(user);
        const { errors, filters } = validateListQuery(query, { isStaff: staff });
        if (errors.length) throw HttpError.unprocessable('Tham số tìm kiếm không hợp lệ', errors);
        const paging = parsePagination(query, { defaultSize: 12, maxSize: 50 });

        const [rows, total] = await Promise.all([
            TitleRepository.findList(filters, paging.size, paging.offset),
            TitleRepository.countList(filters)
        ]);

        const genreRows = await TitleRepository.findGenresForTitles(rows.map((r) => r.id));
        const byTitle = new Map();
        genreRows.forEach((g) => {
            if (!byTitle.has(g.title_id)) byTitle.set(g.title_id, []);
            byTitle.get(g.title_id).push(g);
        });

        return {
            items: rows.map((r) => toListItem(r, byTitle.get(r.id) || [], staff)),
            pagination: buildPagination(paging, total)
        };
    }

    static async getById(idRaw, user) {
        const id = parseId(idRaw);
        const row = await TitleRepository.findById(id);
        // Bản nháp / đã ẩn: coi như không tồn tại với người không phải nhân viên (không lộ sự tồn tại)
        if (!row || (row.status !== 'published' && !isStaff(user))) {
            throw HttpError.notFound('Không tìm thấy tác phẩm', 'TITLE_NOT_FOUND');
        }

        const [genres, credits, mine] = await Promise.all([
            TitleRepository.findGenresForTitles([id]),
            TitleRepository.findCredits(id),
            user ? RatingRepository.findMine(user.id, id) : null
        ]);

        return {
            ...toListItem(row, genres, isStaff(user)),
            synopsis: row.synopsis,
            createdAt: row.created_at,
            credits: credits.map((c) => ({ personId: c.id, name: c.full_name, role: c.credit_role, order: c.billing_order })),
            myRating: user ? (mine ? mine.score : null) : undefined
        };
    }

    static async create(body, user, ip) {
        const { errors, value } = validateTitleInput(body);
        if (errors.length) throw HttpError.unprocessable('Dữ liệu tác phẩm không hợp lệ', errors);
        await checkReferences(value);

        const prior = await RatingRepository.currentPriorMean(ranking.fallbackPriorMean);
        const created = await TitleRepository.create(value, user.id, prior);
        await AuditLogService.logAction(user.id, 'TITLE_CREATE', 'titles', created.id, ip);
        return created;
    }

    static async update(idRaw, body, user, ip) {
        const id = parseId(idRaw);
        const existing = await TitleRepository.findById(id);
        if (!existing) throw HttpError.notFound('Không tìm thấy tác phẩm', 'TITLE_NOT_FOUND');

        const { errors, value } = validateTitleInput(body, { existingKind: existing.kind });
        if (errors.length) throw HttpError.unprocessable('Dữ liệu tác phẩm không hợp lệ', errors);
        await checkReferences(value);

        const ok = await TitleRepository.replace(id, value);
        if (!ok) throw HttpError.notFound('Không tìm thấy tác phẩm', 'TITLE_NOT_FOUND');
        await AuditLogService.logAction(user.id, 'TITLE_UPDATE', 'titles', id, ip);
        return { id, code: existing.code };
    }

    // Xóa mềm: chuyển sang "hidden"
    static async remove(idRaw, user, ip) {
        const id = parseId(idRaw);
        const ok = await TitleRepository.setStatus(id, 'hidden');
        if (!ok) throw HttpError.notFound('Không tìm thấy tác phẩm', 'TITLE_NOT_FOUND');
        await AuditLogService.logAction(user.id, 'TITLE_DELETE', 'titles', id, ip);
    }
}

module.exports = TitleService;
