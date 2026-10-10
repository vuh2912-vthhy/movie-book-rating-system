'use strict';
const HttpError = require('../utils/httpError');
const { parseId } = require('../utils/params');
const { validateRatingInput } = require('../utils/titleValidators');
const ranking = require('../config/ranking');
const TitleRepository = require('../repositories/titleRepository');
const RatingRepository = require('../repositories/ratingRepository');
const AuditLogService = require('./auditLogService');

const notFound = () => HttpError.notFound('Không tìm thấy tác phẩm', 'TITLE_NOT_FOUND');

// Chỉ chấm điểm tác phẩm đã công bố
async function requirePublishedTitle(id) {
    const title = await TitleRepository.findById(id);
    if (!title || title.status !== 'published') throw notFound();
    return title;
}

class RatingService {
    // Chỉ đọc điểm CỦA CHÍNH người đăng nhập: userId lấy từ token, không nhận từ đường dẫn (không có IDOR)
    static async getMine(user, titleIdRaw) {
        const id = parseId(titleIdRaw);
        await requirePublishedTitle(id);
        const mine = await RatingRepository.findMine(user.id, id);
        return { titleId: id, score: mine ? mine.score : null };
    }

    static async upsert(user, titleIdRaw, body, ip) {
        const id = parseId(titleIdRaw);
        const { errors, value } = validateRatingInput(body);
        if (errors.length) throw HttpError.unprocessable('Điểm đánh giá không hợp lệ', errors);
        await requirePublishedTitle(id);

        const result = await RatingRepository.upsert({
            userId: user.id,
            titleId: id,
            score: value.score,
            minVotes: ranking.minVotes,
            fallbackPrior: ranking.fallbackPriorMean
        });
        if (!result) throw notFound();

        await AuditLogService.logAction(user.id, 'RATING_UPSERT', 'ratings', result.ratingId, ip);
        return {
            created: result.created,
            data: { titleId: id, score: value.score, previousScore: result.previousScore, stats: result.stats }
        };
    }

    static async remove(user, titleIdRaw, ip) {
        const id = parseId(titleIdRaw);
        await requirePublishedTitle(id);

        const result = await RatingRepository.remove({
            userId: user.id,
            titleId: id,
            minVotes: ranking.minVotes,
            fallbackPrior: ranking.fallbackPriorMean
        });
        if (!result) throw HttpError.notFound('Bạn chưa chấm điểm tác phẩm này', 'RATING_NOT_FOUND');

        await AuditLogService.logAction(user.id, 'RATING_DELETE', 'ratings', result.ratingId, ip);
        return { titleId: id, stats: result.stats };
    }
}

module.exports = RatingService;
