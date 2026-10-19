#!/usr/bin/env node
'use strict';
/**
 * BM1 - bằng chứng "TRƯỚC - SAU" cho tiêm nhiễm SQL, KHÔNG cần cơ sở dữ liệu, KHÔNG kết nối mạng.
 * In ra câu SQL thực sự được tạo khi (a) NỐI CHUỖI dữ liệu người dùng (cách sai, chỉ để minh họa) và
 * (b) dùng THAM SỐ HÓA như mã nguồn của dự án. Chạy:  node scripts/bm1-before-after.js
 * Chỉ dùng trên máy của bạn để minh họa; hệ thống thật chỉ dùng cách (b).
 */
const mysql = require('mysql2');
const payloads = ["' OR '1'='1", "');DROP TABLE users;--", "x' UNION SELECT email, password_hash FROM users -- "];
const line = '='.repeat(100);
console.log(`${line}\nBM1 - TRƯỚC (nối chuỗi, CÁCH SAI) và SAU (tham số hóa, cách của dự án) | ${new Date().toLocaleString('vi-VN', { hour12: false })}\n${line}`);
for (const p of payloads) {
    const before = `SELECT id, title FROM titles WHERE status = 'published' AND title_search LIKE '%${p}%'`;
    const after = mysql.format('SELECT id, title FROM titles WHERE status = ? AND title_search LIKE ? ESCAPE \'\\\\\'', ['published', `%${p}%`]);
    console.log(`\nDữ liệu người dùng nhập: ${p}`);
    console.log(`  TRƯỚC (nối chuỗi): ${before}`);
    console.log('       -> phần dữ liệu thoát khỏi dấu nháy và trở thành MÃ SQL (điều kiện luôn đúng / lệnh mới / UNION).');
    console.log(`  SAU   (tham số hóa): ${after}`);
    console.log('       -> toàn bộ chuỗi nằm TRONG một chuỗi ký tự đã thoát dấu nháy; chỉ được tìm như văn bản, không thể thực thi.');
}
console.log(`\n${line}\nKết luận: dự án dùng dấu ? cho MỌI giá trị từ người dùng; tên cột sắp xếp chỉ lấy từ danh sách trắng (ORDER_BY trong titleRepository).`);
console.log('Chứng minh trên hệ thống thật: node scripts/bm-evidence.js <URL> --only=bm1');
