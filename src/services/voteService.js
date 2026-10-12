'use strict';
const HttpError = require('../utils/httpError');
const { parseId } = require('../utils/params');
const { validateVote } = require('../utils/reviewValidators');
const ReviewRepository = require('../repositories/reviewRepository');
const VoteRepository = require('../repositories/voteRepository');

// Chỉ bình chọn bình luận đang công khai; bình luận khác coi như không tồn tại (không lộ sự tồn tại)
async function requirePublicReview(id) {
    const review = await ReviewRepository.findById(id);
    if (!review || review.status !== 'approved') throw HttpError.notFound('Không tìm thấy bình luận', 'REVIEW_NOT_FOUND');
    return review;
}

class VoteService {
    static async set(user, reviewIdRaw, body) {
        const reviewId = parseId(reviewIdRaw);
        const { errors, value } = validateVote(body);
        if (errors.length) throw HttpError.unprocessable('Phiếu bình chọn không hợp lệ', errors);
        const review = await requirePublicReview(reviewId);
        // QTNV-11: không tự bình chọn bình luận của mình
        if (review.user_id === user.id) throw HttpError.forbidden('Không thể bình chọn bình luận của chính mình', 'OWN_REVIEW');

        const { created } = await VoteRepository.upsert(reviewId, user.id, value.vote);
        const counts = await VoteRepository.counts(reviewId);
        return { created, data: { reviewId, myVote: value.vote, votes: counts } };
    }

    static async remove(user, reviewIdRaw) {
        const reviewId = parseId(reviewIdRaw);
        await requirePublicReview(reviewId);
        const removed = await VoteRepository.remove(reviewId, user.id);
        if (!removed) throw HttpError.notFound('Bạn chưa bình chọn bình luận này', 'VOTE_NOT_FOUND');
        const counts = await VoteRepository.counts(reviewId);
        return { reviewId, myVote: 0, votes: counts };
    }
}

module.exports = VoteService;
