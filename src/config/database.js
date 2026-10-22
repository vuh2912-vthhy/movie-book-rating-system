'use strict';
const mysql = require('mysql2/promise');
const env = require('./env');


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
    timezone: 'Z',        
    dateStrings: true,    
    decimalNumbers: true, 
    waitForConnections: true,
    connectionLimit: env.db.poolLimit, 
    queueLimit: 0
});

module.exports = pool;
