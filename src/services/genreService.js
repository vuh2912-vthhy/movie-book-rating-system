'use strict';
const GenreRepository = require('../repositories/genreRepository');

class GenreService {
    static async list() {
        const rows = await GenreRepository.findAll();
        return rows.map((g) => ({ id: g.id, code: g.code, name: g.name, appliesTo: g.applies_to }));
    }
}

module.exports = GenreService;
