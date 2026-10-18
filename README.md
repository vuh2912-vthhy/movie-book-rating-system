# Hệ thống Đánh giá và Phân tích Dữ liệu Phim/Sách

# Hệ thống Đánh giá và Phân tích Dữ liệu Phim/Sách (DT11 – CSE702051)

Nhóm 5 · Lớp học phần N03 · Nhánh công nghệ B (Node.js/Express + MySQL 8, triển khai Vercel + Aiven).
Dữ liệu mô phỏng phục vụ mục đích học tập.

- Địa chỉ trực tuyến: `<điền URL Vercel>`  ·  Repository: `<điền liên kết>`

## 1. Kiến trúc
Controller → Service → Repository (`src/controllers`, `src/services`, `src/repositories`), middleware xác thực/phân quyền/bảo mật (`src/middlewares`),
lỗi thống nhất `{success:false, error:{code,message,details}}`, API REST `/api/v1`, đặc tả `openapi.yaml`.
Giao diện tối thiểu: `index.html` + `public/` (mọi dữ liệu chèn bằng `textContent`).

## 2. Cài đặt chạy cục bộ (≤ 30 phút)
Yêu cầu: Node.js 20+, MySQL 8.0.
```bash
cp .env.example .env            # Windows PowerShell: Copy-Item .env.example .env ; rồi sửa DB_*, JWT_SECRET
mysql -u root -p -e "CREATE DATABASE doan_db CHARACTER SET utf8mb4"
mysql -u root -p doan_db < db/schema.mysql.sql
mysql -u root -p doan_db < db/05_add_file_content.sql
mysql -u root -p doan_db < db/seed.sql          # tài khoản demo dùng chung một mã băm (xem mục 4)
npm install
npm start                       # http://localhost:3000
curl -i http://localhost:3000/api/v1/health     # 200 OK
```
Sinh `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 3. Biến môi trường
Xem `.env.example` (không chứa giá trị thật). Bắt buộc: `DB_HOST, DB_USER, DB_NAME, JWT_SECRET (≥32 ký tự)`.
Trên Vercel khai báo cùng tên biến trong Project Settings → Environment Variables. **Không commit `.env`.**

## 4. Tài khoản kiểm thử
Mật khẩu demo: `aahhn123`
| Vai trò | Email |
|---|---|
| ADMIN | `admin01@demo.local` |
| MODERATOR | `mod01@demo.local`, `mod02@demo.local` |
| USER | `user001@demo.local` ... `user397@demo.local` |
(bảng đầy đủ: Phụ lục B báo cáo).

## 5. Kiểm thử và bằng chứng
```bash
npm run smoke                                   # đăng nhập, phân quyền
BASE=https://<url> DEMO_PASSWORD=... node scripts/evidence.js $BASE      # BM4, BM5, nhật ký
node scripts/bm-evidence.js https://<url>       # BM1, BM2, BM3, BM7, BM9, BM10, BM12 (BM8: MOD_EMAIL/MOD_PASSWORD)
node scripts/perf-measure.js https://<url> --label=truoc   # rồi --label=sau, rồi --compare
```
BM6: `SELECT email, password_hash FROM users LIMIT 3;` (mã băm bắt đầu `$2b$`).
BM11: `git log --all -p | grep -n -i -E "password\s*=|secret\s*=|api[_-]?key|BEGIN (RSA|OPENSSH) PRIVATE KEY" | head`
Hiệu năng: `db/06_perf_load.sql` (nạp 5 000 tác phẩm), `db/07_explain_before_after.sql` (EXPLAIN trước/sau chỉ mục).

## 6. Đóng gói
`bash scripts/pack.sh CSE702051_N03_Nhom05_DT11` (loại `.env`, `node_modules`, `.git`; kiểm tra chuỗi bí mật trước khi nén).


### Bảng phiên bản chuẩn của nhóm
| Công cụ / Môi trường | Phiên bản yêu cầu |
|----------------------|-------------------|
| Hệ điều hành         | Windows 10/11     |
| Trình duyệt kiểm thử | Google Chrome 120+|
| Ngôn ngữ (Node.js)   | v20.11.0          |
| Trình quản lý gói    | npm 10.2.4        |
| Quản lý phiên bản Git| 2.43.0            |
| Cơ sở dữ liệu        | MySQL 8.0         |
| Công cụ soạn thảo    | VS Code           |

*Ghi chú: Vui lòng chạy lệnh `node -v` và `git --version` trước khi code để đảm bảo đúng môi trường.*