'use strict';
const FileService = require('../services/fileService');

class FileController {
    static async uploadPoster(req, res, next) {
        try {
            const out = await FileService.uploadPoster({
                file: req.file, titleId: Number(req.params.id), user: req.user, ip: req.ip
            });
            res.status(201).location(out.url).json({ success: true, message: 'Đã tải ảnh bìa', data: out });
        } catch (error) { next(error); }
    }

    static async serve(req, res, next) {
        try {
            const f = await FileService.getPoster(Number(req.params.id));
            res.set({
                'Content-Type': f.mime_detected,                 
                'Content-Length': f.size_bytes,
                'X-Content-Type-Options': 'nosniff',
                'Content-Disposition': 'inline',
                'Cache-Control': 'public, max-age=86400',
                'ETag': `"${f.sha256}"`
            });
            res.status(200).end(f.content);
        } catch (error) { next(error); }
    }
}

module.exports = FileController;
