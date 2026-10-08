const db = require('../config/database');

class LogService {
    static async logAction(userId, action, entity, entityId = null, ip = null) {
        try {
            const query = `
                INSERT INTO audit_logs (user_id, action, entity, entity_id, ip) 
                VALUES (?, ?, ?, ?, ?)
            `;
            // Sử dụng truy vấn tham số hóa theo đúng chuẩn đầu ra
            await db.query(query, [userId || null, action, entity, entityId, ip]);
        } catch (error) {
            // Chỉ in lỗi ra console để không làm sập luồng nghiệp vụ chính của người dùng
            console.error("Lỗi hệ thống khi ghi audit log:", error.message);
        }
    }
}

module.exports = LogService;