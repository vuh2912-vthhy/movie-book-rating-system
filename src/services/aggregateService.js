'use strict';
const ranking = require('../config/ranking');
const AggregateRepository = require('../repositories/aggregateRepository');
const AuditLogService = require('./auditLogService');

class AggregateService {
    static async reconcile() {
        const rows = await AggregateRepository.findMismatches();
        return {
            consistent: rows.length === 0,
            mismatches: rows.map((r) => ({
                titleId: r.title_id,
                ratingCount: Number(r.rating_count),
                actualCount: Number(r.actual_count),
                ratingSum: Number(r.rating_sum),
                actualSum: Number(r.actual_sum)
            }))
        };
    }

    static async rebuild(user, ip) {
        const result = await AggregateRepository.rebuildAll(ranking.minVotes, ranking.fallbackPriorMean);
        await AuditLogService.logAction(user.id, 'AGGREGATES_REBUILD', 'aggregates', null, ip);
        return { ...result, minVotes: ranking.minVotes };
    }
}

module.exports = AggregateService;
