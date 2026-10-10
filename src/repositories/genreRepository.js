'use strict';
const db = require('../config/database');

class GenreRepository {
    static async findAll() {
        const [rows] = await db.query('SELECT id, code, name, applies_to FROM genres ORDER BY name ASC, id ASC');
        return rows;
    }

    static async findByIds(ids) {
        if (!ids.length) return [];
        const [rows] = await db.query('SELECT id, code, name, applies_to FROM genres WHERE id IN (?)', [ids]);
        return rows;
    }
}

module.exports = GenreRepository;
