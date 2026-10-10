'use strict';
const GenreService = require('../services/genreService');

class GenreController {
    static async list(req, res, next) {
        try {
            res.status(200).json({ success: true, data: await GenreService.list() });
        } catch (error) { next(error); }
    }
}

module.exports = GenreController;
