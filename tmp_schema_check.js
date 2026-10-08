const db = require('./src/config/database');

(async () => {
    try {
        for (const table of ['users', 'roles', 'user_roles', 'audit_logs']) {
            const [rows] = await db.query(`SELECT COUNT(*) AS total FROM ${table}`);
            console.log(`${table}: ${rows[0].total} rows`);
        }
    } catch (e) {
        console.error('ERROR:', e.message);
    }
    process.exit(0);
})();
