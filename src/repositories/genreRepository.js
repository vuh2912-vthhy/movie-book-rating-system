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

    static async findById(id) {
        const [rows] = await db.query('SELECT id, code, name, applies_to FROM genres WHERE id = ? LIMIT 1', [id]);
        return rows[0] || null;
    }

    static async create({ code, name, appliesTo }) {
        const [res] = await db.query('INSERT INTO genres (code, name, applies_to) VALUES (?, ?, ?)', [code, name, appliesTo]);
        return res.insertId;
    }

    static async update(id, { code, name, appliesTo }) {
        const [res] = await db.query('UPDATE genres SET code = ?, name = ?, applies_to = ? WHERE id = ?', [code, name, appliesTo, id]);
        return res.affectedRows;
    }

    // Xóa nguyên tử: chỉ xóa khi không tác phẩm nào dùng (không kiểm tra rồi mới xóa)
    static async deleteIfUnused(id) {
        const [res] = await db.query(
            'DELETE FROM genres WHERE id = ? AND NOT EXISTS (SELECT 1 FROM title_genres tg WHERE tg.genre_id = genres.id)', [id]);
        return res.affectedRows;
    }
}

module.exports = GenreRepository;
