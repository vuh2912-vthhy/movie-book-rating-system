'use strict';
require('dotenv').config();

const REQUIRED = ['DB_HOST', 'DB_USER', 'DB_NAME', 'JWT_SECRET'];
const missing = REQUIRED.filter((key) => !process.env[key] || !String(process.env[key]).trim());
if (missing.length) {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${missing.join(', ')}. Xem tệp .env.example`);
}
if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET phải dài tối thiểu 32 ký tự.');
}

const toPositiveInt = (value, fallback) => {
    const n = parseInt(value, 10);
    return Number.isInteger(n) && n > 0 ? n : fallback;
};

const DURATION_UNITS = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
const parseDurationMs = (text) => {
    const match = /^(\d+)\s*([smhd])$/i.exec(String(text || '').trim());
    return match ? parseInt(match[1], 10) * DURATION_UNITS[match[2].toLowerCase()] : null;
};

const jwtExpiresIn = parseDurationMs(process.env.JWT_EXPIRES_IN) ? process.env.JWT_EXPIRES_IN.trim() : '1h';
const isLocalDb = ['localhost', '127.0.0.1'].includes(process.env.DB_HOST);

module.exports = Object.freeze({
    isProd: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
    port: toPositiveInt(process.env.PORT, 3000),
    db: Object.freeze({
        host: process.env.DB_HOST,
        port: toPositiveInt(process.env.DB_PORT, 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME,
        ssl: process.env.DB_SSL ? process.env.DB_SSL === 'true' : !isLocalDb,
        sslCa: process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, '\n') : null,
        poolLimit: toPositiveInt(process.env.DB_POOL_LIMIT, 5)
    }),
    jwt: Object.freeze({
        secret: process.env.JWT_SECRET,
        algorithm: 'HS256',
        expiresIn: jwtExpiresIn,
        expiresInMs: parseDurationMs(jwtExpiresIn)
    }),
    bcryptRounds: toPositiveInt(process.env.BCRYPT_ROUNDS, 10),
    login: Object.freeze({
        maxAttempts: toPositiveInt(process.env.LOGIN_MAX_ATTEMPTS, 5),
        lockMinutes: toPositiveInt(process.env.LOGIN_LOCK_MINUTES, 15)
    })
});
