'use strict';
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_USER = process.env.DB_USER || 'test';
process.env.DB_NAME = process.env.DB_NAME || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
process.env.BCRYPT_ROUNDS = '4'; 
process.env.MAIL_SIMULATION = 'true';
process.env.STATS_CACHE_TTL_SECONDS = '60';

const path = require('path');
const root = path.join(__dirname, '..', '..');
exports.mock = (rel, exportsObj) => {
    const file = require.resolve(path.join(root, rel));
    require.cache[file] = { id: file, filename: file, loaded: true, exports: exportsObj };
};
exports.fresh = (rel) => {
    const file = require.resolve(path.join(root, rel));
    delete require.cache[file];
    return require(file);
};
exports.req = (over = {}) => ({ method: 'POST', headers: {}, cookies: {}, ip: '1.2.3.4', ...over });
exports.res = () => {
    const h = {};
    return { headers: h, setHeader(k, v) { h[k.toLowerCase()] = v; } };
};
