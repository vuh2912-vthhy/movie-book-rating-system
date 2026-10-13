'use strict';
const HttpError = require('../utils/httpError');
const ranking = require('../config/ranking');
const { validateRanking, validateGenres, validateTimeline } = require('../utils/statsValidators');
const StatsRepository = require('../repositories/statsRepository');
const RatingRepository = require('../repositories/ratingRepository');

const round = (v, d) => Number(v.toFixed(d));
// Trung bình làm tròn 2 chữ số kiểu ROUND() của MySQL (0,5 làm tròn lên), tính bằng số nguyên
const avg2 = (sum, count) => (count > 0 ? Math.floor((sum * 200 + count) / (count * 2)) / 100 : null);
const sqlTime = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const fail = (message, errors) => { if (errors.length) throw HttpError.unprocessable(message, errors); };

class StatsService {
    // ---------------------------------------------------------- xếp hạng (công khai)
    static async ranking(query) {
        const { errors, value } = validateRanking(query);
        fail('Tham số xếp hạng không hợp lệ', errors);
        const filters = { kind: value.kind, genre: value.genre };

        let items;
        let prior;
        if (value.source === 'live') {
            prior = await StatsRepository.priorMeanFromRatings(ranking.fallbackPriorMean);
            const rows = await StatsRepository.rankingLive(filters, value.limit, ranking.minVotes, prior);
            items = rows.map((r) => {
                const count = Number(r.rating_count);
                const sum = Number(r.rating_sum);
                return {
                    id: r.id, code: r.code, kind: r.kind, title: r.title, releaseYear: r.release_year,
                    ratingCount: count, ratingAvg: avg2(sum, count),
                    weightedScore: round((sum + ranking.minVotes * prior) / (count + ranking.minVotes), 4)
                };
            });
        } else {
            prior = await RatingRepository.currentPriorMean(ranking.fallbackPriorMean);
            const rows = await StatsRepository.rankingAggregate(filters, value.limit);
            items = rows.map((r) => ({
                id: r.id, code: r.code, kind: r.kind, title: r.title, releaseYear: r.release_year,
                ratingCount: Number(r.rating_count),
                ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg),
                weightedScore: Number(r.weighted_score)
            }));
        }
        return {
            items: items.map((it, i) => ({ rank: i + 1, ...it })),
            meta: { source: value.source, minVotes: ranking.minVotes, priorMean: round(prior, 4), count: items.length, kind: value.kind || null, genre: value.genre || null }
        };
    }

    // ---------------------------------------------------------- theo thể loại
    static async genres(query) {
        const { errors, value } = validateGenres(query);
        fail('Tham số không hợp lệ', errors);
        const [rows, tops] = await Promise.all([StatsRepository.genreStats(value.kind), StatsRepository.topTitlePerGenre(value.kind)]);
        const topBy = new Map(tops.map((t) => [t.genre_id, t]));
        const items = rows.map((r) => {
            const count = Number(r.rating_count);
            const top = topBy.get(r.id);
            return {
                genreId: r.id, code: r.code, name: r.name,
                titleCount: Number(r.title_count), ratingCount: count, reviewCount: Number(r.review_count),
                ratingAvg: avg2(Number(r.rating_sum), count),
                topTitle: top ? { id: top.title_id, code: top.code, title: top.title, weightedScore: Number(top.weighted_score) } : null
            };
        });
        return { items, meta: { kind: value.kind || null } };
    }

    // ---------------------------------------------------------- theo thời gian
    static async timeline(query, now = new Date()) {
        const { errors, value } = validateTimeline(query);
        fail('Tham số không hợp lệ', errors);

        // Danh sách kỳ liên tục (kỳ không có dữ liệu được điền 0 để biểu đồ không đứt đoạn)
        const periods = [];
        let since;
        if (value.granularity === 'day') {
            for (let i = value.days - 1; i >= 0; i -= 1) {
                periods.push(sqlTime(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i))).slice(0, 10));
            }
            since = `${periods[0]} 00:00:00`;
        } else {
            for (let i = value.months - 1; i >= 0; i -= 1) {
                periods.push(sqlTime(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))).slice(0, 7));
            }
            since = `${periods[0]}-01 00:00:00`;
        }

        const { ratings, reviews } = await StatsRepository.timeline(value.granularity, since, value.kind);
        const rBy = new Map(ratings.map((r) => [String(r.period), r]));
        const vBy = new Map(reviews.map((r) => [String(r.period), r]));
        const items = periods.map((p) => {
            const r = rBy.get(p);
            const v = vBy.get(p);
            const count = r ? Number(r.ratings) : 0;
            return {
                period: p, ratings: count, avgScore: r ? avg2(Number(r.score_sum), count) : null,
                reviews: v ? Number(v.reviews) : 0, approvedReviews: v ? Number(v.approved) : 0
            };
        });
        return {
            items,
            meta: { granularity: value.granularity, from: periods[0], to: periods[periods.length - 1], kind: value.kind || null },
            totals: { ratings: items.reduce((s, i) => s + i.ratings, 0), reviews: items.reduce((s, i) => s + i.reviews, 0) }
        };
    }

    // ---------------------------------------------------------- tổng quan
    static async overview(now = new Date()) {
        const since30 = sqlTime(new Date(now.getTime() - 30 * 86400000));
        const r = await StatsRepository.overview(since30);
        const n = (k) => Number(r[k]);
        return {
            users: { total: n('users_total'), active: n('users_active') },
            titles: { total: n('titles_total'), published: n('titles_published') },
            ratings: { total: n('ratings_total'), last30Days: n('ratings_last_30_days') },
            reviews: { total: n('reviews_total'), pending: n('reviews_pending'), approved: n('reviews_approved'), rejected: n('reviews_rejected'), hidden: n('reviews_hidden') },
            reports: { open: n('reports_open'), resolved: n('reports_resolved'), dismissed: n('reports_dismissed') },
            oldestPendingReviewAt: r.oldest_pending_at || null
        };
    }

    // ---------------------------------------------------------- danh mục (dùng cho xuất báo cáo)
    static async catalog(limit = 2000) {
        const rows = await StatsRepository.catalog(limit);
        const names = await StatsRepository.genreNamesForTitles(rows.map((r) => r.id));
        const byTitle = new Map();
        names.forEach((g) => { if (!byTitle.has(g.title_id)) byTitle.set(g.title_id, []); byTitle.get(g.title_id).push(g.name); });
        return rows.map((r) => ({
            id: r.id, code: r.code, kind: r.kind, title: r.title, releaseYear: r.release_year,
            genres: (byTitle.get(r.id) || []).join('; '),
            ratingCount: Number(r.rating_count), ratingAvg: r.rating_avg === null ? null : Number(r.rating_avg),
            weightedScore: Number(r.weighted_score), reviewCount: Number(r.review_count)
        }));
    }
}

module.exports = StatsService;
