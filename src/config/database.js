'use strict';
const mysql = require('mysql2/promise');
const env = require('./env');

// Aiven bắt buộc SSL. Nếu cung cấp DB_SSL_CA thì xác thực đầy đủ chứng chỉ máy chủ;
// nếu không, chỉ mã hóa đường truyền (chấp nhận cho môi trường học tập).
const buildSsl = () => {
    if (!env.db.ssl) return undefined;
    return env.db.sslCa ? { ca: env.db.sslCa } : { rejectUnauthorized: false };
};

const pool = mysql.createPool({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    ssl: buildSsl(),
    charset: 'utf8mb4',
    timezone: 'Z',        // đọc/ghi thời gian theo UTC
    dateStrings: true,    // trả DATETIME dạng chuỗi 'YYYY-MM-DD HH:MM:SS', không tự đổi múi giờ
    decimalNumbers: true, // DECIMAL trả về số, không phải chuỗi
    waitForConnections: true,
    connectionLimit: env.db.poolLimit, // giữ nhỏ vì Vercel chạy nhiều bản sao hàm
    queueLimit: 0
});

module.exports = pool;
