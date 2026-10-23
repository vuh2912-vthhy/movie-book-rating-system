set -euo pipefail
NAME="${1:-CSE702051_N03_Nhom05_DT11}"
OUT="../${NAME}"
rm -rf "$OUT" "../${NAME}.zip"
mkdir -p "$OUT"/{00_HOSO,01_BAOCAO,02_MANGUON,03_CSDL,04_TAILIEU,05_KIEMTHU,06_DEMO,07_THIETKE}
find . -mindepth 1 \
  \( -name node_modules -o -name .git -o -name .env \
     -o -name '.env.*' -o -name storage -o -name '*.log' \
     -o -name 'perf-*.json' -o -name .vscode \) -prune \
  -o -type f -print0 |
while IFS= read -r -d '' file; do
  rel="${file#./}"
  mkdir -p "$OUT/02_MANGUON/$(dirname "$rel")"
  cp -p "$file" "$OUT/02_MANGUON/$rel"
done
cp .env.example "$OUT/02_MANGUON/.env.example"
cp db/*.sql db/generate_seed.py "$OUT/03_CSDL/"
cp openapi.yaml "$OUT/04_TAILIEU/"
if find "$OUT" \( -name '.env' -o -name node_modules \) | grep -q .; then echo "LỖI: còn .env hoặc node_modules"; exit 1; fi
if grep -rIlE --exclude=pack.sh "mysql://|avnadmin|BEGIN (RSA|OPENSSH) PRIVATE KEY" "$OUT" 2>/dev/null; then echo "LỖI: còn chuỗi bí mật ở các tệp trên"; exit 1; fi
powershell.exe -NoProfile -Command "Compress-Archive -Path '../${NAME}' -DestinationPath '../${NAME}.zip' -Force"
unzip -l "../${NAME}.zip" | tail -1
echo "Đã tạo ../${NAME}.zip. Bổ sung 00_HOSO, 01_BAOCAO, 05_KIEMTHU, 06_DEMO, 07_THIETKE rồi giải nén thử trên máy khác."
