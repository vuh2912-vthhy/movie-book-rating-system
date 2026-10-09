'use strict';
// Chẩn đoán kết nối CSDL. Chạy:  node scripts/check-db.js
// Không in mật khẩu hay khóa bí mật.
const HINTS = {
    ENOTFOUND: 'DB_HOST sai chính tả hoặc máy không phân giải được tên miền (kiểm tra mạng/DNS).',
    ECONNREFUSED: 'Cổng bị từ chối: sai DB_PORT, hoặc dịch vụ MySQL đang tắt.',
    ETIMEDOUT: 'Hết thời gian chờ: sai DB_PORT, dịch vụ Aiven đang TẮT (gói miễn phí tự tắt khi không dùng: vào Aiven Console bấm Power on), hoặc mạng/tường lửa chặn.',
    ER_ACCESS_DENIED_ERROR: 'Sai DB_USER hoặc DB_PASSWORD. Nếu đã đổi mật khẩu trên Aiven, hãy cập nhật lại trong .env.',
    ER_BAD_DB_ERROR: 'DB_NAME không tồn tại (Aiven thường là defaultdb).',
    HANDSHAKE_SSL_ERROR: 'Lỗi SSL: thử DB_SSL=true (Aiven bắt buộc SSL).',
    ER_NOT_SUPPORTED_AUTH_MODE: 'Kiểu xác thực không được hỗ trợ: cập nhật gói mysql2 (npm install mysql2@latest).',
    ER_NO_SUCH_TABLE: 'Chưa nạp schema: chạy db/schema.mysql.sql rồi db/seed.sql.',
    PROTOCOL_CONNECTION_LOST: 'Kết nối bị cắt giữa chừng: thường do thiếu SSL (DB_SSL=true) hoặc dịch vụ vừa khởi động lại.'
};

(async () => {
    let env;
    try {
        env = require('../src/config/env');
    } catch (error) {
        console.error('LỖI CẤU HÌNH:', error.message);
        process.exit(1);
    }

    console.log('Đang thử kết nối với:');
    console.log(`  host     = ${env.db.host}`);
    console.log(`  port     = ${env.db.port}`);
    console.log(`  user     = ${env.db.user}`);
    console.log(`  database = ${env.db.database}`);
    console.log(`  ssl      = ${env.db.ssl}${env.db.sslCa ? ' (có CA)' : ''}`);
    console.log(`  mật khẩu = ${env.db.password ? `đã đặt (${env.db.password.length} ký tự)` : 'TRỐNG'}\n`);

    const db = require('../src/config/database');
    try {
        await db.query('SELECT 1');
        console.log('ĐẠT  Kết nối thành công.');

        const [[ver]] = await db.query('SELECT VERSION() AS v');
        console.log(`     Phiên bản MySQL: ${ver.v}`);

        const [tables] = await db.query(
            'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name'
        );
        console.log(`     Số bảng trong CSDL: ${tables.length} (mong đợi 18)`);
        if (tables.length) console.log(`     Gồm: ${tables.map((t) => t.name).join(', ')}`);

        for (const name of ['users', 'roles', 'user_roles', 'permissions', 'role_permissions', 'audit_logs']) {
            try {
                const [[row]] = await db.query(`SELECT COUNT(*) AS n FROM ${name}`);
                console.log(`ĐẠT  ${name}: ${row.n} dòng`);
            } catch (error) {
                console.log(`LỖI  ${name}: ${error.code || error.message}`);
            }
        }

        const [cols] = await db.query(
            "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users'"
        );
        const have = cols.map((c) => c.name);
        const missing = ['password_hash', 'failed_login_count', 'locked_until', 'token_version'].filter((c) => !have.includes(c));
        console.log(missing.length
            ? `LỖI  Bảng users thiếu cột: ${missing.join(', ')} (chạy db/01_migrate_token_version.sql hoặc nạp lại schema.mysql.sql mới)`
            : 'ĐẠT  Bảng users có đủ cột cần cho xác thực');

        // Chạy đúng truy vấn mà middleware xác thực dùng cho mỗi yêu cầu có đăng nhập
        console.log('\nThử truy vấn tra cứu vai trò và quyền (giống middleware xác thực):');
        const [[admin]] = await db.query("SELECT id FROM users WHERE email = 'admin01@demo.local' LIMIT 1");
        if (!admin) {
            console.log('LỖI  Không có tài khoản admin01@demo.local (chưa nạp seed.sql?)');
        } else {
            try {
                const UserRepository = require('../src/repositories/userRepository');
                const ctx = await UserRepository.findAuthContextById(admin.id);
                console.log(`ĐẠT  admin01: vai trò = ${ctx.roles.join(', ') || '(không có)'}; ${ctx.permissions.length} quyền; tokenVersion = ${ctx.tokenVersion}`);
                if (!ctx.roles.length) console.log('     CẢNH BÁO: tài khoản chưa có vai trò (bảng user_roles trống hoặc chưa nạp seed).');
            } catch (error) {
                console.log(`LỖI  Truy vấn xác thực thất bại: ${error.code || ''} - ${error.sqlMessage || error.message}`);
                console.log('     Gửi nguyên văn dòng này cho trợ lý.');
            }
        }
    } catch (error) {
        console.error(`LỖI  Không kết nối được: ${error.code || 'UNKNOWN'} - ${error.message}`);
        console.error(`GỢI Ý: ${HINTS[error.code] || 'Gửi nguyên văn dòng lỗi trên cho trợ lý.'}`);
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();
