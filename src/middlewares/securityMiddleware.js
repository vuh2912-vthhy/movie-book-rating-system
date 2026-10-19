'use strict';
// BM2/BM3/BM10/BM12: thẻ tiêu đề bảo mật, chống CSRF, giới hạn tần suất.
// Tự viết, không thêm thư viện: ít phụ thuộc, dễ giải trình trong báo cáo.
const env = require('../config/env');
const HttpError = require('../utils/httpError');

// ---------------------------------------------------------------------------
// BM12 + BM2 (CSP): thẻ tiêu đề bảo mật trên MỌI phản hồi.
// ---------------------------------------------------------------------------
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

const securityHeaders = (req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
};

// ---------------------------------------------------------------------------
// BM3: CSRF. Phiên dùng cookie => yêu cầu thay đổi trạng thái phải:
//   (1) cùng nguồn gốc: tiêu đề Origin (hoặc Referer) trùng Host của máy chủ;
//   (2) gửi JSON (Content-Type: application/json), vì biểu mẫu HTML chéo trang
//       không thể gửi kiểu này mà không qua CORS preflight.
// Bổ sung cho cookie SameSite=Strict đã đặt ở authController.
// Yêu cầu dùng Bearer (không có cookie) và yêu cầu không có Origin/Referer (công cụ ngoài trình duyệt) được miễn.
// ---------------------------------------------------------------------------
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const csrfProtection = (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const usesCookie = Boolean(req.cookies && req.cookies.accessToken);
    if (!usesCookie) return next();

    // Trình duyệt luôn gửi Origin (hoặc Referer) trong yêu cầu POST/PUT/DELETE chéo trang.
    // Yêu cầu KHÔNG có cả hai là từ công cụ ngoài trình duyệt (curl, Postman, kịch bản kiểm thử): không thể là CSRF
    // và vẫn bị cookie SameSite=Strict + xác thực bảo vệ, nên được miễn kiểm tra Origin.
    const origin = req.headers.origin || (req.headers.referer ? safeOrigin(req.headers.referer) : null);
    if (!origin) return next();

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    let originHost = null;
    try { originHost = new URL(origin).host; } catch (e) { originHost = null; }

    if (!originHost || originHost !== host) {
        return next(HttpError.forbidden('Yêu cầu bị từ chối: không cùng nguồn gốc (CSRF)', 'CSRF_BLOCKED'));
    }
    // Cùng nguồn gốc: thân yêu cầu phải là JSON (hoặc multipart cho tải tệp)
    const type = (req.headers['content-type'] || '').toLowerCase();
    if (type && !type.startsWith('application/json') && !type.startsWith('multipart/form-data')) {
        return next(HttpError.forbidden('Kiểu nội dung không được phép', 'CSRF_BLOCKED'));
    }
    return next();
};

function safeOrigin(url) {
    try { return new URL(url).origin; } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// BM10: giới hạn tần suất theo IP (cửa sổ cố định, lưu trong bộ nhớ).
// Lưu ý trung thực cho báo cáo: trên Vercel (serverless) bộ nhớ không dùng chung
// giữa các thể hiện, nên đây là lớp phụ. Lớp chính là khóa tài khoản tạm trong
// CSDL (users.is_temp_locked): sai 5 lần => lần 6 trả 429, có hiệu lực mọi thể hiện.
// ---------------------------------------------------------------------------
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
    // dọn rác định kỳ để Map không phình
    if (buckets.size > 5000) {
        for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
    }
    return next();
};

// Chỉ đếm các yêu cầu GHI (đăng ký, đăng nhập, đăng xuất); GET /auth/me do giao diện gọi khi tải trang nên không đếm.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, code: 'TOO_MANY_REQUESTS_AUTH', message: 'Quá nhiều yêu cầu đăng nhập/đăng ký từ địa chỉ này', skip: (req) => req.method === 'GET' });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, code: 'TOO_MANY_REQUESTS' });

module.exports = { securityHeaders, csrfProtection, rateLimit, authLimiter, apiLimiter };
