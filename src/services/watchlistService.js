'use strict';
const HttpError = require('../utils/httpError');
const { parseId, parsePagination, buildPagination } = require('../utils/params');
const { validateWatchlist, validateEnumQuery, LIST_TYPES } = require('../utils/reviewValidators');
const TitleRepository = require('../repositories/titleRepository');
const WatchlistRepository = require('../repositories/watchlistRepository');
const AuditLogService = require('./auditLogService');

class WatchlistService {
    static async list(user, query) {
        const type = validateEnumQuery(query, 'listType', LIST_TYPES, undefined);
        if (type.error) throw HttpError.unprocessable('Tham số không hợp lệ', [type.error]);
        const paging = parsePagination(query, { defaultSize: 12, maxSize: 50 });
        const [rows, total] = await Promise.all([
            WatchlistRepository.list(user.id, type.value, paging.size, paging.offset),
            WatchlistRepository.count(user.id, type.value)
        ]);
        return {
            items: rows.map((r) => ({
                titleId: r.title_id, code: r.code, kind: r.kind, title: r.title, releaseYear: r.release_year,
                listType: r.list_type, addedAt: r.added_at,
                stats: { ratingCount: Number(r.rating_count), ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg), weightedScore: Number(r.weighted_score) }
            })),
            pagination: buildPagination(paging, total)
        };
    }

    static async set(user, titleIdRaw, body, ip) {
        const titleId = parseId(titleIdRaw, 'titleId');
        const { errors, value } = validateWatchlist(body);
        if (errors.length) throw HttpError.unprocessable('Dữ liệu không hợp lệ', errors);
        const title = await TitleRepository.findById(titleId);
        if (!title || title.status !== 'published') throw HttpError.notFound('Không tìm thấy tác phẩm', 'TITLE_NOT_FOUND');

        const { created } = await WatchlistRepository.upsert(user.id, titleId, value.listType);
        if (created) await AuditLogService.logAction(user.id, 'WATCHLIST_ADD', 'titles', titleId, ip);
        return { created, data: { titleId, listType: value.listType } };
    }

    static async remove(user, titleIdRaw, ip) {
        const titleId = parseId(titleIdRaw, 'titleId');
        const removed = await WatchlistRepository.remove(user.id, titleId);
        if (!removed) throw HttpError.notFound('Tác phẩm không có trong danh sách theo dõi', 'WATCHLIST_ITEM_NOT_FOUND');
        await AuditLogService.logAction(user.id, 'WATCHLIST_REMOVE', 'titles', titleId, ip);
        return { titleId };
    }
}

module.exports = WatchlistService;
