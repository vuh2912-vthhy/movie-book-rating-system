'use strict';
const env = require('../config/env');
const HttpError = require('../utils/httpError');

const CSP = [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",   // Chart.js từ CDN (nếu dùng)
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
].join('; ');

const CSP_DOCS = CSP.replace("style-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net")
    .replace("img-src 'self' data:", "img-src 'self' data: https://cdn.jsdelivr.net");

const securityHeaders = (req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', req.path === '/api-docs' ? CSP_DOCS : CSP);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const csrfProtection = (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const usesCookie = Boolean(req.cookies && req.cookies.accessToken);
    if (!usesCookie) return next();

    const origin = req.headers.origin || (req.headers.referer ? safeOrigin(req.headers.referer) : null);
    if (!origin) return next();

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    let originHost = null;
    try { originHost = new URL(origin).host; } catch (e) { originHost = null; }

    if (!originHost || originHost !== host) {
        return next(HttpError.forbidden('Yêu cầu bị từ chối: không cùng nguồn gốc (CSRF)', 'CSRF_BLOCKED'));
    }
    const type = (req.headers['content-type'] || '').toLowerCase();
    if (type && !type.startsWith('application/json') && !type.startsWith('multipart/form-data')) {
        return next(HttpError.forbidden('Kiểu nội dung không được phép', 'CSRF_BLOCKED'));
    }
    return next();
};

function safeOrigin(url) {
    try { return new URL(url).origin; } catch (e) { return null; }
}

const buckets = new Map();

const rateLimit = ({ windowMs, max, code = 'TOO_MANY_REQUESTS', message = 'Quá nhiều yêu cầu, vui lòng thử lại sau', skip }) => (req, res, next) => {
    if (skip && skip(req)) return next();
    const now = Date.now();
    const key = `${code}:${req.ip}`;
    let b = buckets.get(key);
    if (!b || now >= b.resetAt) {
        b = { count: 0, resetAt: now + windowMs };
        buckets.set(key, b);
    }
    b.count += 1;
    const remaining = Math.max(0, max - b.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    if (b.count > max) {
        const retry = Math.ceil((b.resetAt - now) / 1000);
        res.setHeader('Retry-After', String(retry));
        return next(HttpError.tooManyRequests(message, code));
    }
    if (buckets.size > 5000) {
        for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
    }
    return next();
};

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, code: 'TOO_MANY_REQUESTS_AUTH', message: 'Quá nhiều yêu cầu đăng nhập/đăng ký từ địa chỉ này', skip: (req) => req.method === 'GET' });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, code: 'TOO_MANY_REQUESTS' });

module.exports = { securityHeaders, csrfProtection, rateLimit, authLimiter, apiLimiter };
