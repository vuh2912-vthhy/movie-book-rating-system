'use strict';
const db = require('../config/database');
const { escapeLike } = require('../utils/text');

class PersonRepository {
    static async findExistingIds(ids) {
        if (!ids.length) return [];
        const [rows] = await db.query('SELECT id FROM persons WHERE id IN (?)', [ids]);
        return rows.map((r) => r.id);
    }

    static async listPaginated({ q }, limit, offset) {
        const params = []; let clause = '';
        if (q) { clause = 'WHERE full_name LIKE ?'; params.push(`%${escapeLike(q)}%`); }
        const [rows] = await db.query(
            `SELECT id, full_name, birth_year, country FROM persons ${clause} ORDER BY full_name ASC, id ASC LIMIT ? OFFSET ?`,
            [...params, limit, offset]);
        const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM persons ${clause}`, params);
        return { rows, total: count.total };
    }

    static async findById(id) {
        const [rows] = await db.query('SELECT id, full_name, birth_year, country FROM persons WHERE id = ? LIMIT 1', [id]);
        return rows[0] || null;
    }

    static async create({ fullName, birthYear, country }) {
        const [res] = await db.query('INSERT INTO persons (full_name, birth_year, country) VALUES (?, ?, ?)', [fullName, birthYear, country]);
        return res.insertId;
    }

    static async update(id, { fullName, birthYear, country }) {
        const [res] = await db.query('UPDATE persons SET full_name = ?, birth_year = ?, country = ? WHERE id = ?', [fullName, birthYear, country, id]);
        return res.affectedRows;
    }
}

module.exports = PersonRepository;
