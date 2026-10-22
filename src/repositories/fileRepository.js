'use strict';
const { withTransaction } = require('../utils/transaction');
const db = require('../config/database');

class FileRepository {
    static async createPoster({ ownerId, titleId, originalName, storedName, mime, size, sha256, content }) {
        return withTransaction(async (conn) => {
            const [exists] = await conn.execute('SELECT id FROM titles WHERE id = ? FOR UPDATE', [titleId]);
            if (!exists.length) return null;
            const [res] = await conn.execute(
                `INSERT INTO files (owner_id, title_id, purpose, original_name, stored_name, mime_detected, size_bytes, sha256, content)
                 VALUES (?, ?, 'poster', ?, ?, ?, ?, ?, ?)`,
                [ownerId, titleId, originalName, storedName, mime, size, sha256, content]
            );
            await conn.execute('UPDATE titles SET poster_path = ? WHERE id = ?', [`/api/v1/files/${res.insertId}`, titleId]);
            return res.insertId;
        });
    }

    static async findContentById(id) {
        const [rows] = await db.execute(
            `SELECT id, mime_detected, size_bytes, sha256, content FROM files WHERE id = ? AND purpose = 'poster'`, [id]);
        return rows[0] || null;
    }
}

module.exports = FileRepository;
