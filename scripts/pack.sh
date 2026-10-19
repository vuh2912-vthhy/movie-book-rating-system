#!/usr/bin/env bash
# Đóng gói nộp bài theo Phụ lục 08. KHÔNG đưa vào: .env, node_modules, .git, tệp tải lên, perf/log tạm.
# Chạy từ thư mục gốc dự án:  bash scripts/pack.sh CSE702051_N03_Nhom05_DT11
set -euo pipefail
NAME="${1:-CSE702051_N03_Nhom05_DT11}"
OUT="../${NAME}"
rm -rf "$OUT" "../${NAME}.zip"
mkdir -p "$OUT"/{00_HOSO,01_BAOCAO,02_MANGUON,03_CSDL,04_TAILIEU,05_KIEMTHU,06_DEMO,07_THIETKE}
rsync -a --exclude node_modules --exclude .git --exclude .env --exclude '.env.*' --exclude storage --exclude '*.log' \
      --exclude 'perf-*.json' --exclude .vscode ./ "$OUT/02_MANGUON/"
cp .env.example "$OUT/02_MANGUON/.env.example"
cp db/*.sql db/generate_seed.py "$OUT/03_CSDL/"
cp openapi.yaml "$OUT/04_TAILIEU/"
if find "$OUT" \( -name '.env' -o -name node_modules \) | grep -q .; then echo "LỖI: còn .env hoặc node_modules"; exit 1; fi
if grep -rIlE --exclude=pack.sh "mysql://|avnadmin|BEGIN (RSA|OPENSSH) PRIVATE KEY" "$OUT" 2>/dev/null; then echo "LỖI: còn chuỗi bí mật ở các tệp trên"; exit 1; fi
(cd .. && zip -qr "${NAME}.zip" "${NAME}")
unzip -l "../${NAME}.zip" | tail -1
echo "Đã tạo ../${NAME}.zip. Bổ sung 00_HOSO, 01_BAOCAO, 05_KIEMTHU, 06_DEMO, 07_THIETKE rồi giải nén thử trên máy khác."
