const mysql = require('mysql2/promise');
require('dotenv').config(); 

// Tạo Pool kết nối đến CSDL (Sẽ lấy thông tin thật từ file .env của bạn)
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'movie_rating',
    port: process.env.DB_PORT || 3306,
    ssl: {
        rejectUnauthorized: false 
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;