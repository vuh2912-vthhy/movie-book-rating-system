'use strict';
const HttpError = require('../utils/httpError');
const { parseId, parsePagination, buildPagination, invalid } = require('../utils/params');
const { validateReviewBody, validateEnumQuery, REVIEW_SORTS } = require('../utils/reviewValidators');
const TitleRepository = require('../repositories/titleRepository');
const ReviewRepository = require('../repositories/reviewRepository');
const AuditLogService = require('./auditLogService');
const cache = require('../utils/cache');

const toMine = (r) => ({
    id: r.id, body: r.body, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at || null
});

async function requirePublishedTitle(id) {
    const title = await TitleRepository.findById(id);
    if (!title || title.status !== 'published') throw HttpError.notFound('Không tìm thấy tác phẩm', 'TITLE_NOT_FOUND');
    return title;
}

class ReviewService {
    // Danh sách công khai: chỉ bình luận đã duyệt, kèm số phiếu hữu ích và phiếu của người đang xem
    static async listPublic(titleIdRaw, query, user) {
        const titleId = parseId(titleIdRaw);
        const sort = validateEnumQuery(query, 'sort', REVIEW_SORTS, 'newest');
        if (sort.error) throw HttpError.unprocessable('Tham số không hợp lệ', [sort.error]);
        const paging = parsePagination(query, { defaultSize: 10, maxSize: 50 });
        await requirePublishedTitle(titleId);

        const [rows, total] = await Promise.all([
            ReviewRepository.findPublicByTitle(titleId, sort.value, paging.size, paging.offset),
            ReviewRepository.countPublicByTitle(titleId)
        ]);
        const ids = rows.map((r) => r.id);
        const [counts, mine] = await Promise.all([
            ReviewRepository.findVoteCounts(ids),
            user ? ReviewRepository.findMyVotes(user.id, ids) : []
        ]);
        const countBy = new Map(counts.map((c) => [c.review_id, c]));
        const voteBy = new Map(mine.map((m) => [m.review_id, Number(m.vote)]));

        return {
            items: rows.map((r) => ({
                id: r.id, body: r.body, authorName: r.display_name, authorScore: r.author_score === null ? null : Number(r.author_score),
                createdAt: r.created_at, updatedAt: r.updated_at || null,
                votes: { up: Number((countBy.get(r.id) || {}).up || 0), down: Number((countBy.get(r.id) || {}).down || 0) },
                ...(user ? { myVote: voteBy.get(r.id) || 0 } : {})
            })),
            pagination: buildPagination(paging, total)
        };
    }

    static async getMine(user, titleIdRaw) {
        const titleId = parseId(titleIdRaw);
        const row = await ReviewRepository.findMine(user.id, titleId);
        if (!row) throw HttpError.notFound('Bạn chưa bình luận tác phẩm này', 'REVIEW_NOT_FOUND');
        return toMine(row);
    }

    static async create(user, titleIdRaw, body, ip) {
        const titleId = parseId(titleIdRaw);
        const { errors, value } = validateReviewBody(body);
        if (errors.length) throw HttpError.unprocessable('Nội dung bình luận không hợp lệ', errors);
        await requirePublishedTitle(titleId);

        // QTNV-10: chỉ bình luận khi đã chấm điểm
        if (!(await ReviewRepository.hasRating(user.id, titleId))) {
            throw HttpError.forbidden('Bạn cần chấm điểm tác phẩm trước khi bình luận', 'RATING_REQUIRED');
        }
        let id;
        try {
            id = await ReviewRepository.create({ userId: user.id, titleId, body: value.body });
        } catch (error) {
            if (error && error.code === 'ER_DUP_ENTRY') {
                throw HttpError.conflict('Bạn đã bình luận tác phẩm này; hãy sửa bình luận hiện có', 'REVIEW_EXISTS');
            }
            throw error;
        }
        cache.clear(); // dữ liệu nguồn đổi: bỏ đệm thống kê/xếp hạng
        await AuditLogService.logAction(user.id, 'REVIEW_CREATE', 'reviews', id, ip);
        return { id, status: 'pending' };
    }

    static async updateMine(user, titleIdRaw, body, ip) {
        const titleId = parseId(titleIdRaw);
        const { errors, value } = validateReviewBody(body);
        if (errors.length) throw HttpError.unprocessable('Nội dung bình luận không hợp lệ', errors);

        const result = await ReviewRepository.updateMine({ userId: user.id, titleId, body: value.body });
        if (result.notFound) throw HttpError.notFound('Bạn chưa bình luận tác phẩm này', 'REVIEW_NOT_FOUND');
        if (result.blocked) throw HttpError.forbidden('Bình luận đã bị ẩn do vi phạm, không thể chỉnh sửa', 'REVIEW_HIDDEN');

        cache.clear(); // dữ liệu nguồn đổi: bỏ đệm thống kê/xếp hạng
        await AuditLogService.logAction(user.id, 'REVIEW_UPDATE', 'reviews', result.id, ip);
        return { id: result.id, status: 'pending', previousStatus: result.previousStatus };
    }

    static async removeMine(user, titleIdRaw, ip) {
        const titleId = parseId(titleIdRaw);
        const result = await ReviewRepository.removeMine({ userId: user.id, titleId });
        if (result.notFound) throw HttpError.notFound('Bạn chưa bình luận tác phẩm này', 'REVIEW_NOT_FOUND');
        cache.clear(); // dữ liệu nguồn đổi: bỏ đệm thống kê/xếp hạng
        await AuditLogService.logAction(user.id, 'REVIEW_DELETE', 'reviews', result.id, ip);
        return { id: result.id };
    }

    static async listMine(user, query) {
        const paging = parsePagination(query, { defaultSize: 10, maxSize: 50 });
        const [rows, total] = await Promise.all([
            ReviewRepository.listMine(user.id, paging.size, paging.offset),
            ReviewRepository.countMine(user.id)
        ]);
        return {
            items: rows.map((r) => ({
                id: r.id, titleId: r.title_id, titleCode: r.code, titleName: r.title,
                body: r.body, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at || null
            })),
            pagination: buildPagination(paging, total)
        };
    }
}

module.exports = ReviewService;
