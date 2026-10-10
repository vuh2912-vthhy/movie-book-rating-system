'use strict';
const db = require('../config/database');

class PersonRepository {
    static async findExistingIds(ids) {
        if (!ids.length) return [];
        const [rows] = await db.query('SELECT id FROM persons WHERE id IN (?)', [ids]);
        return rows.map((r) => r.id);
    }
}

module.exports = PersonRepository;
