#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sinh du lieu mau cho De tai 11 - He thong Danh gia va Phan tich Du lieu Phim/Sach
Hoc phan CSE702051 Thiet ke web nang cao

Chi dung thu vien chuan cua Python 3.8+. Cung tham so --seed cho ra cung mot
tep seed.sql (tai lap duoc).

Cach chay:
    python3 generate_seed.py                          # mac dinh, khoang 12.000 luot cham
    python3 generate_seed.py --users 100 --titles 120 --ratings 3000 --audit 400
                                                       # ban gon cho InfinityFree / phpMyAdmin

Mat khau tai khoan kiem thu:
    Mac dinh ma bam mat khau la GIA TRI MINH HOA (khong dang nhap duoc).
    De co ma bam that (bcrypt, cost 10) cho tat ca tai khoan demo, chon 1 trong 2 cach:
      a) Dung Node (khong can cai them gi): trong thu muc du an chay
             DEMO_PASSWORD='mat-khau-demo-rieng' node scripts/hash-password.js
         roi truyen ket qua:  python3 generate_seed.py --password-hash '$2b$10$...'
      b) pip install bcrypt
             DEMO_PASSWORD='mat-khau-demo-rieng' python3 generate_seed.py
    Mat khau khong duoc ghi trong ma nguon; tat ca tai khoan demo dung chung
    mot ma bam. KHONG dung lai mat khau ca nhan.

Thiet ke du lieu (de phuc vu muc 5.4 va 6.5 cua bao cao):
  - 02 tac pham "bom tan" co hang tram luot cham, diem trung binh khoang 4,5 sao.
  - 03 tac pham "bay" co dung 01 luot cham 5 sao. Diem trung binh don thuan
    xep chung len tren bom tan; diem co xet do tin cay (m = 25) thi khong.
  - Phan bo do pho bien theo luat luy thua (Zipf): vai tac pham chiem phan lon
    luot cham, nhieu tac pham chi co vai luot.
  - Toan bo ten nguoi, ten tac pham, noi dung la DU LIEU GIA LAP; neu trung
    ten voi nguoi hoac tac pham that thi chi la ngau nhien.

Thu tu nap: schema.mysql.sql roi seed.sql (seed.sql chay duoc tren MySQL 8.0).
"""
import argparse
import datetime as dt
import itertools
import math
import os
import random
import sys
import unicodedata

M_MIN_VOTES = 25  # tham so m cua cong thuc xep hang co xet do tin cay

# ------------------------------------------------------------------ tien ich


def strip_accents(s):
    s = s.replace("đ", "d").replace("Đ", "D")
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


class Raw(str):
    """Gia tri chen nguyen van vao cau lenh SQL (so thap phan da dinh dang)."""


def lit(v):
    if v is None:
        return "NULL"
    if isinstance(v, Raw):
        return str(v)
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, dt.datetime):
        return "'" + v.strftime("%Y-%m-%d %H:%M:%S") + "'"
    s = str(v)
    assert "\\" not in s, "Du lieu khong duoc chua dau gach cheo nguoc"
    return "'" + s.replace("'", "''") + "'"


def emit(out, table, cols, rows, chunk=500):
    rows = list(rows)
    for i in range(0, len(rows), chunk):
        part = rows[i:i + chunk]
        out.write("INSERT INTO %s (%s) VALUES\n" % (table, ", ".join(cols)))
        out.write(",\n".join("(" + ", ".join(lit(v) for v in r) + ")" for r in part))
        out.write(";\n\n")


# ------------------------------------------------------------ kho du lieu mau

HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ",
      "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý"]
DEM = ["Minh", "Ngọc", "Thanh", "Anh", "Hải", "Gia", "Quang", "Bảo", "Khánh", "Thu"]
TEN = ["An", "Bình", "Chi", "Dũng", "Giang", "Hà", "Hiếu", "Khoa", "Lan", "Linh",
       "Long", "Mai", "Nam", "Phong", "Phúc", "Quân", "Quỳnh", "Sơn", "Thảo",
       "Trang", "Tuấn", "Vy", "Yến", "Hương"]
F_FIRST = ["Elena", "Marcus", "Sofia", "Liam", "Hana", "Kenji", "Amara", "Lucas",
           "Nora", "Daniel", "Mira", "Oscar", "Ivy", "Theo", "Yuki", "Rafael"]
F_LAST = ["Hartwell", "Moreau", "Lindqvist", "Okafor", "Tanaka", "Brennan",
          "Castillo", "Volkov", "Ashford", "Navarro", "Ellison", "Marlowe",
          "Petrov", "Ishida", "Delacroix", "Whitfield"]
F_COUNTRY = ["Hoa Kỳ", "Pháp", "Nhật Bản", "Hàn Quốc", "Anh", "Đức", "Thụy Điển", "Nigeria"]

T_PRE = ["Ký ức", "Hành trình", "Bí mật", "Lời hứa", "Con đường", "Thành phố",
         "Đêm", "Mùa", "Tiếng vọng", "Cánh cửa", "Ngọn lửa", "Dấu chân",
         "Giấc mơ", "Bóng tối", "Ánh sáng", "Vùng đất", "Người giữ", "Lá thư",
         "Chuyến tàu", "Hòn đảo"]
T_SUF = ["cuối cùng", "bị lãng quên", "phương Bắc", "trong sương", "không tên",
         "của biển", "mùa hạ", "đã mất", "bên kia núi", "thứ bảy", "dưới mưa",
         "ở phía Tây", "còn lại", "xa xôi", "trong gương", "của mẹ",
         "không ngủ", "đầu tiên", "trên cao", "sau cơn bão"]
EN_PRE = ["Echoes of", "The Last", "Beyond the", "Shadows of", "Letters from",
          "The Silent", "Winter in", "Return to"]
EN_SUF = ["Harbor", "Garden", "Frontier", "Orchard", "Lighthouse", "Meridian",
          "Northern Sky", "River"]

SYN_TOPIC = ["một gia đình nhỏ", "hai người bạn cũ", "một nhà báo trẻ",
             "một nhóm sinh viên", "một người thợ sửa đồng hồ", "một thủy thủ về hưu"]
SYN_SETTING = ["một thị trấn ven biển", "thành phố sau chiến tranh", "vùng núi phía Bắc",
               "một con tàu đêm", "khu phố cổ", "một hòn đảo xa"]
SYN_THEME = ["ký ức và sự tha thứ", "tình bạn và sự phản bội", "lựa chọn của tuổi trẻ",
             "gánh nặng của bí mật", "hành trình tìm lại chính mình", "tình yêu và sự mất mát"]

GENRES = [
    ("action", "Hành động", "movie"), ("romance", "Tình cảm", "both"),
    ("comedy", "Hài hước", "both"), ("horror", "Kinh dị", "both"),
    ("scifi", "Khoa học viễn tưởng", "both"), ("adventure", "Phiêu lưu", "both"),
    ("drama", "Tâm lý", "both"), ("animation", "Hoạt hình", "movie"),
    ("documentary", "Tài liệu", "both"), ("mystery", "Trinh thám", "both"),
    ("history", "Lịch sử", "both"), ("family", "Gia đình", "both"),
    ("literature", "Văn học đương đại", "book"), ("children", "Thiếu nhi", "book"),
    ("fantasy", "Giả tưởng", "both"), ("biography", "Tiểu sử và hồi ký", "both"),
]

ROLES = [(1, "ADMIN", "Quản trị hệ thống"), (2, "MODERATOR", "Người kiểm duyệt nội dung"),
         (3, "USER", "Người dùng đã đăng nhập"), (4, "GUEST", "Khách xem (chưa đăng nhập)")]

PERMS = [
    ("title.read", "title", "read"), ("title.create", "title", "create"),
    ("title.update", "title", "update"), ("title.delete", "title", "delete"),
    ("file.upload", "file", "upload"),
    ("rating.create", "rating", "create"), ("rating.update_own", "rating", "update_own"),
    ("rating.delete_own", "rating", "delete_own"),
    ("review.read", "review", "read"), ("review.create", "review", "create"),
    ("review.update_own", "review", "update_own"), ("review.delete_own", "review", "delete_own"),
    ("review.moderate", "review", "moderate"),
    ("vote.create", "vote", "create"), ("watchlist.manage", "watchlist", "manage"),
    ("report.create", "report", "create"), ("report.handle", "report", "handle"),
    ("stats.read", "stats", "read"), ("stats.export", "stats", "export"),
    ("audit.read", "audit", "read"), ("user.manage", "user", "manage"),
    ("role.manage", "role", "manage"),
]
ROLE_PERMS = {
    "ADMIN": [p[0] for p in PERMS],
    "MODERATOR": ["title.read", "title.create", "title.update", "file.upload",
                  "review.read", "review.moderate", "report.handle", "stats.read"],
    "USER": ["title.read", "rating.create", "rating.update_own", "rating.delete_own",
             "review.read", "review.create", "review.update_own", "review.delete_own",
             "vote.create", "watchlist.manage", "report.create", "stats.read"],
    "GUEST": ["title.read", "review.read", "stats.read"],
}

REV_OPEN_POS = ["{Nd} có cốt truyện chặt chẽ và nhiều lớp ý nghĩa.",
                "Nhân vật được xây dựng có chiều sâu, cảm xúc rất thật.",
                "Cách kể chuyện mạch lạc, không dư thừa chi tiết nào.",
                "Phần kết khiến tôi suy nghĩ rất lâu.",
                "Rất đáng để {v} lại lần thứ hai.",
                "Một trải nghiệm {v} đáng nhớ trong năm nay."]
REV_MID = ["Nhìn chung ổn nhưng đoạn giữa hơi chậm.",
           "Có vài ý tưởng hay, tiếc là chưa khai thác hết.",
           "Phù hợp để giải trí cuối tuần, không quá đặc sắc.",
           "Nửa đầu cuốn hút hơn nửa sau.",
           "Điểm số này theo tôi là công bằng.",
           "{Nd} có điểm mạnh và điểm yếu khá rõ ràng."]
REV_NEG = ["Kỳ vọng nhiều hơn những gì {nd} mang lại.",
           "Cốt truyện thiếu logic ở nhiều chỗ.",
           "Nhịp độ chậm và nhân vật khó đồng cảm.",
           "Phần kết khá vội vàng, chưa thuyết phục.",
           "Khó có thể giới thiệu {nd} này cho người khác.",
           "Tôi đã mong chờ nhiều hơn khi {v} đến đoạn cuối."]

REPORT_REASONS = ["spam", "offensive", "spoiler", "off_topic", "other"]

AUDIT_ACTIONS = [  # (action, entity, trong so, nhom nguoi thuc hien)
    ("LOGIN_SUCCESS", "users", 30, "any"), ("LOGOUT", "users", 16, "any"),
    ("LOGIN_FAILED", "users", 8, "fail"),
    ("RATING_UPSERT", "ratings", 22, "user"), ("REVIEW_CREATE", "reviews", 8, "user"),
    ("REVIEW_MODERATE", "reviews", 5, "mod"), ("REPORT_CREATE", "reports", 2, "user"),
    ("REPORT_RESOLVE", "reports", 1, "mod"), ("WATCHLIST_ADD", "watchlists", 6, "user"),
    ("TITLE_CREATE", "titles", 1, "mod"), ("TITLE_UPDATE", "titles", 1, "mod"),
    ("USER_LOCK", "users", 0.3, "admin"), ("ROLE_CHANGE", "users", 0.2, "admin"),
]

# ---------------------------------------------------------------- bo sinh


def main():
    ap = argparse.ArgumentParser(description="Sinh seed.sql cho De tai 11")
    ap.add_argument("--users", type=int, default=400)
    ap.add_argument("--titles", type=int, default=300)
    ap.add_argument("--ratings", type=int, default=12000)
    ap.add_argument("--audit", type=int, default=1500)
    ap.add_argument("--seed", type=int, default=702051)
    ap.add_argument("--ref-date", default="2026-09-30",
                    help="Moc 'hom nay' cua du lieu (YYYY-MM-DD)")
    ap.add_argument("--out", default="seed.sql")
    ap.add_argument("--password-hash", default=None,
                    help="Ma bam bcrypt dung chung cho tai khoan demo (tao bang scripts/hash-password.js)")
    a = ap.parse_args()
    if a.users < 20 or a.titles < 20:
        sys.exit("Can it nhat 20 nguoi dung va 20 tac pham.")

    rng = random.Random(a.seed)
    REF = dt.datetime.strptime(a.ref_date, "%Y-%m-%d").replace(hour=18)
    START = dt.datetime(2024, 9, 1, 9, 0, 0)
    LATEST = REF - dt.timedelta(days=30)

    def rdt(lo, hi, power=1.0):
        span = int((hi - lo).total_seconds())
        if span <= 0:
            return lo
        return lo + dt.timedelta(seconds=int(span * (rng.random() ** power)))

    def cap(t):
        return min(t, REF)

    def vn_name():
        return "%s %s %s" % (rng.choice(HO), rng.choice(DEM), rng.choice(TEN))

    # ---- mat khau ----------------------------------------------------
    pw = os.environ.get("DEMO_PASSWORD")
    if a.password_hash:
        if not a.password_hash.startswith(("$2a$", "$2b$", "$2y$")) or len(a.password_hash) != 60:
            sys.exit("--password-hash khong phai ma bam bcrypt hop le (60 ky tu, bat dau bang $2b$)")
        shared_hash = a.password_hash
        hash_note = "bcrypt do nguoi dung cung cap (--password-hash), dung chung cho moi tai khoan demo"
    elif pw:
        try:
            import bcrypt
        except ImportError:
            sys.exit("Da dat DEMO_PASSWORD nhung chua cai bcrypt: pip install bcrypt "
                     "(hoac dung node scripts/hash-password.js roi truyen --password-hash)")
        shared_hash = bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(10)).decode()
        hash_note = "bcrypt that tu DEMO_PASSWORD (dung chung cho moi tai khoan demo)"
    else:
        alpha = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
        shared_hash = "$2b$10$" + "".join(rng.choice(alpha) for _ in range(53))
        hash_note = "GIA TRI MINH HOA - khong dang nhap duoc; hay dung --password-hash"

    # ---- nguoi dung ---------------------------------------------------
    staff = [("admin01", "ADMIN"), ("mod01", "MODERATOR"), ("mod02", "MODERATOR")]
    role_id = {code: rid for rid, code, _ in ROLES}
    users = []
    for i, (local, role) in enumerate(staff, start=1):
        fn = vn_name()
        users.append(dict(id=i, email="%s@demo.local" % local, full_name=fn,
                          display_name=fn.split()[-1] + " " + fn.split()[0][0] + ".",
                          status="active", role=role,
                          created=dt.datetime(2024, 8, 20, 9, 0, 0)))
    n_normal = a.users - len(staff)
    for k in range(1, n_normal + 1):
        fn = vn_name()
        users.append(dict(id=len(users) + 1, email="user%03d@demo.local" % k,
                          full_name=fn,
                          display_name=fn.split()[-1] + " " + fn.split()[0][0] + ".",
                          status="active", role="USER",
                          created=rdt(START, LATEST)))
    normal = [u for u in users if u["role"] == "USER"]
    n_locked = max(1, round(0.02 * n_normal))
    n_pending = max(1, round(0.01 * n_normal))
    picked = rng.sample(normal, n_locked + n_pending)
    for u in picked[:n_locked]:
        u["status"] = "locked"
    for u in picked[n_locked:]:
        u["status"] = "pending"
    for u in users:
        u["last_login"] = None if u["status"] == "pending" else rdt(u["created"], REF, 0.4)
    by_id = {u["id"]: u for u in users}
    staff_ids = [u["id"] for u in users if u["role"] in ("ADMIN", "MODERATOR")]
    mod_ids = [u["id"] for u in users if u["role"] == "MODERATOR"]
    admin_ids = [u["id"] for u in users if u["role"] == "ADMIN"]
    raters = [u for u in normal if u["status"] == "active"]

    # ---- nguoi (dien vien, dao dien, tac gia) --------------------------
    n_persons = max(60, a.titles // 2)
    persons, seen = [], set()
    while len(persons) < n_persons:
        if rng.random() < 0.6:
            name, country = vn_name(), "Việt Nam"
        else:
            name = "%s %s" % (rng.choice(F_FIRST), rng.choice(F_LAST))
            country = rng.choice(F_COUNTRY)
        if name in seen:
            if len(seen) > 2000:
                break
            continue
        seen.add(name)
        persons.append((len(persons) + 1, name, rng.randint(1940, 2002), country))

    # ---- tac pham ------------------------------------------------------
    genre_rows = [(i, c, n, ap_) for i, (c, n, ap_) in enumerate(GENRES, start=1)]
    genre_ids_for = {
        "movie": [g[0] for g in genre_rows if g[3] in ("movie", "both")],
        "book": [g[0] for g in genre_rows if g[3] in ("book", "both")],
    }
    combos = [(p, s) for p in T_PRE for s in T_SUF]
    rng.shuffle(combos)
    kinds = ["movie"] * (a.titles // 2) + ["book"] * (a.titles - a.titles // 2)
    rng.shuffle(kinds)
    titles, title_genres, title_persons = [], [], []
    person_ids = [p[0] for p in persons]
    for tid in range(1, a.titles + 1):
        kind = kinds[tid - 1]
        p, s = combos[(tid - 1) % len(combos)]
        cycle = (tid - 1) // len(combos)
        name = "%s %s" % (p, s) + ("" if cycle == 0 else " %d" % (cycle + 1))
        orig = None
        if rng.random() < 0.3:
            orig = "%s %s" % (rng.choice(EN_PRE), rng.choice(EN_SUF))
        nd = "bộ phim" if kind == "movie" else "cuốn sách"
        syn = "%s xoay quanh %s trong bối cảnh %s, đồng thời khai thác chủ đề %s." % (
            nd.capitalize(), rng.choice(SYN_TOPIC), rng.choice(SYN_SETTING), rng.choice(SYN_THEME))
        year = rng.randint(1980, 2026) if kind == "movie" else rng.randint(1950, 2026)
        r = rng.random()
        status = "draft" if r < 0.03 else ("hidden" if r < 0.05 else "published")
        titles.append(dict(
            id=tid, code=("MOV-%04d" if kind == "movie" else "BOK-%04d") % tid, kind=kind,
            title=name, orig=orig, search=strip_accents((name + " " + (orig or "")).strip()),
            year=year,
            runtime=rng.randint(80, 180) if kind == "movie" else None,
            pages=rng.randint(120, 800) if kind == "book" else None,
            synopsis=syn, status=status, created_by=rng.choice(staff_ids),
            created=rdt(START, LATEST)))
        for gid in rng.sample(genre_ids_for[kind], rng.randint(1, 3)):
            title_genres.append((tid, gid))
        if kind == "movie":
            cast = rng.sample(person_ids, 6)
            title_persons.append((tid, cast[0], "director", 1))
            for order, pid in enumerate(cast[1:1 + rng.randint(3, 5)], start=1):
                title_persons.append((tid, pid, "actor", order))
            if rng.random() < 0.25:
                title_persons.append((tid, cast[5], "writer", 1))
        else:
            au = rng.sample(person_ids, 2)
            title_persons.append((tid, au[0], "author", 1))
            if rng.random() < 0.15:
                title_persons.append((tid, au[1], "author", 2))

    # ---- luot cham diem -----------------------------------------------
    published = [t for t in titles if t["status"] == "published"]
    rng.shuffle(published)
    blockbusters = published[:2]
    traps = published[2:5]
    others = published[5:]
    quality = {t["id"]: min(4.3, max(2.0, rng.gauss(3.4, 0.6))) for t in titles}
    for t in blockbusters:
        quality[t["id"]] = 4.5
    order = blockbusters + others
    weights = [1.0 / (k + 1) ** 0.8 for k in range(len(order))]
    tcw = list(itertools.accumulate(weights))
    uw = [rng.lognormvariate(0, 0.9) for _ in raters]
    ucw = list(itertools.accumulate(uw))
    bias = {u["id"]: rng.gauss(0, 0.35) for u in raters}

    target = a.ratings - len(traps)
    feasible = int(0.3 * len(raters) * len(order))
    if target > feasible:
        print("Canh bao: giam so luot cham tu %d xuong %d (khong du nguoi/tac pham)"
              % (target, feasible), file=sys.stderr)
        target = feasible
    pairs, tries = set(), 0
    while len(pairs) < target and tries < target * 40:
        us = rng.choices(range(len(raters)), cum_weights=ucw, k=2000)
        ts = rng.choices(range(len(order)), cum_weights=tcw, k=2000)
        for ui, ti in zip(us, ts):
            pairs.add((raters[ui]["id"], order[ti]["id"]))
            if len(pairs) >= target:
                break
        tries += 2000
    t_by_id = {t["id"]: t for t in titles}
    ratings = []
    for uid, tid in pairs:
        sd = 0.6 if quality[tid] >= 4.5 else 0.85
        score = int(round(rng.gauss(quality[tid] + bias[uid], sd)))
        score = max(1, min(5, score))
        lo = max(by_id[uid]["created"], t_by_id[tid]["created"])
        ratings.append(dict(user=uid, title=tid, score=score,
                            created=rdt(lo, REF - dt.timedelta(days=1), 0.7)))
    for t in traps:
        uid = rng.choice(raters)["id"]
        lo = max(by_id[uid]["created"], t["created"])
        ratings.append(dict(user=uid, title=t["id"], score=5,
                            created=rdt(lo, REF - dt.timedelta(days=1), 0.7)))
    ratings.sort(key=lambda r: (r["created"], r["user"], r["title"]))
    for i, r in enumerate(ratings, start=1):
        r["id"] = i
        r["updated"] = None
        if rng.random() < 0.12:
            r["updated"] = cap(r["created"] + dt.timedelta(seconds=rng.randint(3600, 60 * 86400)))

    # ---- binh luan ------------------------------------------------------
    trap_ids = {t["id"] for t in traps}
    eligible = [r for r in ratings if r["title"] not in trap_ids]
    chosen = rng.sample(eligible, min(len(eligible), int(0.2 * len(ratings))))
    reviews = []
    for r in chosen:
        kind = t_by_id[r["title"]]["kind"]
        v = "xem" if kind == "movie" else "đọc"
        nd = "bộ phim" if kind == "movie" else "cuốn sách"
        pool = REV_OPEN_POS if r["score"] >= 4 else (REV_MID if r["score"] == 3 else REV_NEG)
        body = " ".join(rng.sample(pool, rng.randint(1, 3))).format(
            nd=nd, Nd=nd.capitalize(), v=v)
        reviews.append(dict(user=r["user"], title=r["title"], body=body,
                            created=cap(r["created"] + dt.timedelta(minutes=rng.randint(5, 4320)))))
    reviews.sort(key=lambda x: (x["created"], x["user"], x["title"]))
    n_pending_r = int(0.08 * len(reviews))
    for i, rv in enumerate(reviews, start=1):
        rv["id"] = i
        rv["updated"] = None
        rv["moderated_by"] = None
        rv["moderated_at"] = None
        if i > len(reviews) - n_pending_r:
            rv["status"] = "pending"
            continue
        x = rng.random()
        rv["status"] = "hidden" if x < 0.03 else ("rejected" if x < 0.07 else "approved")
        rv["moderated_by"] = rng.choice(admin_ids if rng.random() < 0.1 else mod_ids)
        rv["moderated_at"] = cap(rv["created"] + dt.timedelta(minutes=rng.randint(10, 2880)))
        if rng.random() < 0.08:
            rv["updated"] = cap(rv["created"] + dt.timedelta(minutes=rng.randint(60, 7200)))

    # ---- bao cao vi pham -------------------------------------------------
    reports = []
    rev_by_id = {rv["id"]: rv for rv in reviews}
    reporter_pool = [u["id"] for u in raters]

    def make_report(rv, status):
        reporter = rng.choice(reporter_pool)
        while reporter == rv["user"]:
            reporter = rng.choice(reporter_pool)
        created = cap(rv["created"] + dt.timedelta(minutes=rng.randint(60, 10 * 1440)))
        rep = dict(review=rv["id"], reporter=reporter, reason=rng.choice(REPORT_REASONS),
                   detail=None, status=status, handled_by=None, handled_at=None,
                   created=created)
        if status != "open":
            rep["handled_by"] = rng.choice(mod_ids)
            rep["handled_at"] = cap(created + dt.timedelta(minutes=rng.randint(60, 4320)))
        return rep

    for rv in reviews:
        if rv["status"] == "hidden":
            rep = make_report(rv, "resolved")
            rv["moderated_by"], rv["moderated_at"] = rep["handled_by"], rep["handled_at"]
            reports.append(rep)
    approved = [rv for rv in reviews if rv["status"] == "approved"]
    for rv in rng.sample(approved, min(len(approved), max(5, len(reviews) // 50))):
        reports.append(make_report(rv, "open" if rng.random() < 0.6 else "dismissed"))
    reports.sort(key=lambda x: (x["created"], x["review"], x["reporter"]))
    for i, rp in enumerate(reports, start=1):
        rp["id"] = i

    # ---- phieu huu ich ----------------------------------------------------
    votes = []
    voter_ids = [u["id"] for u in raters]
    for rv in approved:
        k = min(10, int(rng.expovariate(1 / 1.5)))
        for uid in rng.sample(voter_ids, min(k, len(voter_ids))):
            if uid == rv["user"]:
                continue
            votes.append((rv["id"], uid, 1 if rng.random() < 0.8 else -1,
                          cap(rv["created"] + dt.timedelta(minutes=rng.randint(30, 20 * 1440)))))

    # ---- danh sach theo doi -------------------------------------------------
    watch, wseen = [], set()
    rated_by_user = {}
    for r in ratings:
        rated_by_user.setdefault(r["user"], []).append(r)
    pub_idx = list(range(len(order)))
    for u in raters:
        for r in rated_by_user.get(u["id"], []):
            if r["title"] in trap_ids or rng.random() > 0.35:
                continue
            wseen.add((u["id"], r["title"]))
            watch.append((u["id"], r["title"], "done",
                          cap(r["created"] + dt.timedelta(minutes=rng.randint(1, 2880)))))
        k = min(25, int(rng.expovariate(1 / 6)))
        for ti in rng.choices(pub_idx, cum_weights=tcw, k=k):
            tid = order[ti]["id"]
            if (u["id"], tid) in wseen:
                continue
            wseen.add((u["id"], tid))
            watch.append((u["id"], tid, "want" if rng.random() < 0.7 else "watching",
                          rdt(u["created"], REF, 0.7)))
    watch.sort(key=lambda w: (w[3], w[0], w[1]))

    # ---- bang tong hop ---------------------------------------------------------
    cnt, sm = {}, {}
    for r in ratings:
        cnt[r["title"]] = cnt.get(r["title"], 0) + 1
        sm[r["title"]] = sm.get(r["title"], 0) + r["score"]
    C = sum(sm.values()) / max(1, sum(cnt.values()))
    rcount = {}
    for rv in reviews:
        if rv["status"] == "approved":
            rcount[rv["title"]] = rcount.get(rv["title"], 0) + 1
    aggregates = []
    for t in titles:
        v, total = cnt.get(t["id"], 0), sm.get(t["id"], 0)
        if v:
            R = total / v
            ws = (v / (v + M_MIN_VOTES)) * R + (M_MIN_VOTES / (v + M_MIN_VOTES)) * C
            avg = Raw("%.2f" % R)
        else:
            ws, avg = C, None
        aggregates.append((t["id"], v, total, avg, Raw("%.4f" % ws),
                           rcount.get(t["id"], 0), REF))

    # ---- nhat ky he thong ---------------------------------------------------------
    ips = ["203.0.113.%d" % i for i in range(1, 60)] + ["198.51.100.%d" % i for i in range(1, 60)]
    ent_ids = {"users": [u["id"] for u in users], "ratings": [r["id"] for r in ratings],
               "reviews": [r["id"] for r in reviews], "reports": [r["id"] for r in reports] or [1],
               "watchlists": list(range(1, len(watch) + 1)) or [1], "titles": [t["id"] for t in titles]}
    acts = [x for x in AUDIT_ACTIONS if not (x[1] == "reports" and not reports)]
    aw = [x[2] for x in acts]
    audit = []
    for _ in range(max(0, a.audit - 8)):
        action, entity, _w, who = rng.choices(acts, weights=aw)[0]
        if who == "mod":
            uid = rng.choice(mod_ids)
        elif who == "admin":
            uid = rng.choice(admin_ids)
        elif who == "user":
            uid = rng.choice(raters)["id"]
        elif who == "fail":
            uid = None if rng.random() < 0.6 else rng.choice(raters)["id"]
        else:
            uid = rng.choice(users)["id"]
        eid = uid if action in ("LOGIN_SUCCESS", "LOGOUT", "LOGIN_FAILED") and uid else rng.choice(ent_ids[entity])
        if action == "LOGIN_FAILED" and uid is None:
            eid = None
        lo = by_id[uid]["created"] if uid else START
        audit.append(dict(user=uid, action=action, entity=entity, eid=eid,
                          ip=rng.choice(ips), created=rdt(lo, REF, 0.6)))
    locked_users = [u for u in normal if u["status"] == "locked"]
    if locked_users:  # kich ban do mat khau: 7 lan sai trong ~90 giay roi khoa
        lu = locked_users[0]
        ip = rng.choice(ips)
        t0 = rdt(max(lu["created"], REF - dt.timedelta(days=60)), REF - dt.timedelta(days=2))
        for j in range(7):
            audit.append(dict(user=lu["id"], action="LOGIN_FAILED", entity="users",
                              eid=lu["id"], ip=ip, created=t0 + dt.timedelta(seconds=j * 13)))
        audit.append(dict(user=None, action="USER_LOCK", entity="users", eid=lu["id"],
                          ip=ip, created=t0 + dt.timedelta(seconds=95)))
    audit.sort(key=lambda x: x["created"])

    # ---- ghi tep ----------------------------------------------------------------------
    with open(a.out, "w", encoding="utf-8", newline="\n") as out:
        out.write("-- =====================================================================\n")
        out.write("-- DU LIEU MAU - De tai 11 He thong Danh gia va Phan tich Du lieu Phim/Sach\n")
        out.write("-- Sinh boi generate_seed.py (--seed %d, --ref-date %s)\n" % (a.seed, a.ref_date))
        out.write("-- LUU Y: toan bo du lieu la DU LIEU GIA LAP phuc vu muc dich hoc tap.\n")
        out.write("-- Ma bam mat khau: %s\n" % hash_note)
        out.write("-- Tham so xep hang: m = %d, C = %.4f\n" % (M_MIN_VOTES, C))
        out.write("-- =====================================================================\n")
        out.write("SET NAMES utf8mb4;\n\n")
        emit(out, "roles", ["id", "code", "name"], ROLES)
        perm_rows = [(i, c, r, ac) for i, (c, r, ac) in enumerate(PERMS, start=1)]
        emit(out, "permissions", ["id", "code", "resource", "action"], perm_rows)
        emit(out, "users",
             ["id", "email", "password_hash", "full_name", "display_name", "status",
              "last_login_at", "created_at"],
             [(u["id"], u["email"], shared_hash, u["full_name"], u["display_name"],
               u["status"], u["last_login"], u["created"]) for u in users])
        emit(out, "user_roles", ["user_id", "role_id"],
             [(u["id"], role_id[u["role"]]) for u in users])
        pid = {c: i for i, (c, _, _) in enumerate(PERMS, start=1)}
        emit(out, "role_permissions", ["role_id", "permission_id"],
             [(role_id[rc], pid[pc]) for rc, pcs in ROLE_PERMS.items() for pc in pcs])
        emit(out, "genres", ["id", "code", "name", "applies_to"], genre_rows)
        emit(out, "persons", ["id", "full_name", "birth_year", "country"], persons)
        emit(out, "titles",
             ["id", "code", "kind", "title", "original_title", "title_search", "release_year",
              "runtime_min", "page_count", "synopsis", "status", "created_by", "created_at"],
             [(t["id"], t["code"], t["kind"], t["title"], t["orig"], t["search"], t["year"],
               t["runtime"], t["pages"], t["synopsis"], t["status"], t["created_by"],
               t["created"]) for t in titles])
        emit(out, "title_genres", ["title_id", "genre_id"], title_genres)
        emit(out, "title_persons", ["title_id", "person_id", "credit_role", "billing_order"],
             title_persons)
        emit(out, "ratings", ["id", "user_id", "title_id", "score", "created_at", "updated_at"],
             [(r["id"], r["user"], r["title"], r["score"], r["created"], r["updated"])
              for r in ratings])
        emit(out, "reviews",
             ["id", "user_id", "title_id", "body", "status", "moderated_by", "moderated_at",
              "created_at", "updated_at"],
             [(r["id"], r["user"], r["title"], r["body"], r["status"], r["moderated_by"],
               r["moderated_at"], r["created"], r["updated"]) for r in reviews])
        emit(out, "review_votes", ["review_id", "user_id", "vote", "created_at"], votes)
        emit(out, "watchlists", ["id", "user_id", "title_id", "list_type", "added_at"],
             [(i,) + w for i, w in enumerate(watch, start=1)])
        emit(out, "reports",
             ["id", "review_id", "reporter_id", "reason", "detail", "status", "handled_by",
              "handled_at", "created_at"],
             [(r["id"], r["review"], r["reporter"], r["reason"], r["detail"], r["status"],
               r["handled_by"], r["handled_at"], r["created"]) for r in reports])
        emit(out, "aggregates",
             ["title_id", "rating_count", "rating_sum", "rating_avg", "weighted_score",
              "review_count", "updated_at"], aggregates)
        emit(out, "audit_logs", ["id", "user_id", "action", "entity", "entity_id", "ip", "created_at"],
             [(i, x["user"], x["action"], x["entity"], x["eid"], x["ip"], x["created"])
              for i, x in enumerate(audit, start=1)])

    # ---- tom tat ------------------------------------------------------------------------
    total = (len(ROLES) + len(PERMS) + len(users) * 2 + sum(len(v) for v in ROLE_PERMS.values())
             + len(genre_rows) + len(persons) + len(titles) + len(title_genres)
             + len(title_persons) + len(ratings) + len(reviews) + len(votes) + len(watch)
             + len(reports) + len(aggregates) + len(audit))
    print("Da ghi %s (%d KB, %d ban ghi)" % (a.out, os.path.getsize(a.out) // 1024, total))
    for name, n in [("users", len(users)), ("titles", len(titles)), ("persons", len(persons)),
                    ("ratings", len(ratings)), ("reviews", len(reviews)),
                    ("review_votes", len(votes)), ("watchlists", len(watch)),
                    ("reports", len(reports)), ("audit_logs", len(audit))]:
        print("  %-13s %6d" % (name, n))
    print("Tai khoan: admin01, mod01, mod02, user001.. (@demo.local)")
    print("Bom tan: %s | Tac pham bay (1 luot cham 5 sao): %s" % (
        ", ".join(t["code"] for t in blockbusters), ", ".join(t["code"] for t in traps)))


if __name__ == "__main__":
    main()
