'use strict';
// Tham số xếp hạng có xét độ tin cậy (khung T5):
//   weighted_score = (v * R + m * C) / (v + m)
//   v = số lượt chấm, R = điểm trung bình của tác phẩm,
//   m = số lượt chấm tối thiểu để được tin cậy đầy đủ, C = điểm trung bình toàn hệ thống.
// Tác phẩm chưa có lượt chấm (v = 0) nhận weighted_score = C.
const toPositive = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

module.exports = Object.freeze({
    minVotes: Math.floor(toPositive(process.env.RANKING_MIN_VOTES, 25)),
    // Chỉ dùng khi hệ thống chưa có lượt chấm nào để tính trung bình toàn cục
    fallbackPriorMean: toPositive(process.env.RANKING_PRIOR_MEAN, 3.0)
});
