'use strict';
const StatsService = require('../services/statsService');
const ExportService = require('../services/exportService');

async function timed(res, work) {
    const start = process.hrtime.bigint();
    const result = await work();
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    res.set('Server-Timing', `app;dur=${ms.toFixed(1)}`);
    return result;
}

class StatsController {
    static async ranking(req, res, next) {
        try {
            const { items, meta } = await timed(res, () => StatsService.ranking(req.query));
            res.status(200).json({ success: true, data: items, meta });
        } catch (error) { next(error); }
    }

    static async genres(req, res, next) {
        try {
            const { items, meta } = await timed(res, () => StatsService.genres(req.query));
            res.status(200).json({ success: true, data: items, meta });
        } catch (error) { next(error); }
    }

    static async timeline(req, res, next) {
        try {
            const { items, meta, totals } = await timed(res, () => StatsService.timeline(req.query));
            res.status(200).json({ success: true, data: items, meta, totals });
        } catch (error) { next(error); }
    }

    static async overview(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await timed(res, () => StatsService.overview()) });
        } catch (error) { next(error); }
    }

    static async export(req, res, next) {
        try {
            const out = await timed(res, () => ExportService.build(req.query, req.user, req.ip));
            res.set('Content-Type', out.contentType);
            res.set('Content-Disposition', `attachment; filename="${out.filename}"`);
            res.set('Cache-Control', 'no-store');
            res.set('X-Content-Type-Options', 'nosniff');
            res.set('X-Row-Count', String(out.rowCount));
            res.status(200).send(out.body);
        } catch (error) { next(error); }
    }
}

module.exports = StatsController;
