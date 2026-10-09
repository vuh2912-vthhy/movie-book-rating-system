-- =====================================================================
-- LUOC DO CO SO DU LIEU - De tai 11
-- He thong Danh gia va Phan tich Du lieu Phim/Sach
-- Hoc phan CSE702051 Thiet ke web nang cao - Dai hoc Phenikaa
-- Luoc do MySQL 8.0 - Khung thuat toan T5 (tong hop va xep hang)
-- Bon bang loi bat buoc: users, roles, user_roles, audit_logs
-- Thang diem 1-5 sao (theo bao cao Buoi 02). 4 vai tro: ADMIN, MODERATOR, USER, GUEST.
-- users.token_version: so phien ban token. Token phat ra mang so nay; dang xuat, doi mat khau
-- hoac khoa tai khoan se tang so nay len 1 va moi token cu bi tu choi ngay (khong phu thuoc dong ho).
-- (them permissions, role_permissions cho phan quyen theo quyen)
-- =====================================================================
-- Quy uoc diem xep hang (dung o tang nghiep vu va khi nap bang aggregates):
--   weighted_score = (v / (v + m)) * R + (m / (v + m)) * C
--   v = rating_count cua tac pham, R = rating_avg cua tac pham,
--   m = 25 (so luot cham toi thieu de duoc tin cay day du),
--   C = diem trung binh toan he thong.
--   Tac pham chua co luot cham: v = 0 nen weighted_score = C.
-- Bang aggregates la phuong an "duy tri cot tong hop". Phuong an
-- "tinh khi doc" truy van truc tiep tu ratings; hai phuong an can duoc do
-- hieu nang va so sanh trong bao cao (Muc 5.4).
-- =====================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS files;
DROP TABLE IF EXISTS aggregates;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS watchlists;
DROP TABLE IF EXISTS review_votes;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS title_persons;
DROP TABLE IF EXISTS title_genres;
DROP TABLE IF EXISTS titles;
DROP TABLE IF EXISTS persons;
DROP TABLE IF EXISTS genres;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------- loi
CREATE TABLE users (
  id                 BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  email              VARCHAR(190)     NOT NULL,
  password_hash      VARCHAR(255)     NOT NULL,
  full_name          VARCHAR(120)     NOT NULL,
  display_name       VARCHAR(60)      NOT NULL,
  status             VARCHAR(20)      NOT NULL DEFAULT 'active',
  failed_login_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until       DATETIME         NULL,
  token_version      INT UNSIGNED     NOT NULL DEFAULT 0,
  last_login_at      DATETIME         NULL,
  created_at         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_status_created (status, created_at),
  CONSTRAINT chk_users_status CHECK (status IN ('active','locked','pending'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE roles (
  id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32)     NOT NULL,
  name VARCHAR(120)    NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE permissions (
  id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code     VARCHAR(64)     NOT NULL,
  resource VARCHAR(64)     NOT NULL,
  action   VARCHAR(32)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE role_permissions (
  role_id       BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_role_permissions_permission (permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------ nghiep vu
CREATE TABLE genres (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code       VARCHAR(32)     NOT NULL,
  name       VARCHAR(120)    NOT NULL,
  applies_to VARCHAR(8)      NOT NULL DEFAULT 'both',
  PRIMARY KEY (id),
  UNIQUE KEY uq_genres_code (code),
  CONSTRAINT chk_genres_applies CHECK (applies_to IN ('movie','book','both'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE persons (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name  VARCHAR(120)    NOT NULL,
  birth_year SMALLINT        NULL,
  country    VARCHAR(60)     NULL,
  PRIMARY KEY (id),
  KEY idx_persons_name (full_name),
  CONSTRAINT chk_persons_birth CHECK (birth_year IS NULL OR birth_year BETWEEN 1800 AND 2100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Mot bang cho ca phim va sach (cot kind). Cot title_search la ban khong dau,
-- viet thuong cua title + original_title, de tim kiem co dau / khong dau cho
-- cung ket qua va co the danh chi muc FULLTEXT.
CREATE TABLE titles (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code           VARCHAR(32)     NOT NULL,
  kind           VARCHAR(8)      NOT NULL,
  title          VARCHAR(200)    NOT NULL,
  original_title VARCHAR(200)    NULL,
  title_search   VARCHAR(420)    NOT NULL,
  release_year   SMALLINT        NOT NULL,
  runtime_min    INT             NULL,
  page_count     INT             NULL,
  synopsis       TEXT            NULL,
  poster_path    VARCHAR(255)    NULL,
  status         VARCHAR(16)     NOT NULL DEFAULT 'published',
  created_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_titles_code (code),
  KEY idx_titles_kind_status_year (kind, status, release_year),
  KEY idx_titles_status_created (status, created_at),
  FULLTEXT KEY ft_titles_search (title_search),
  CONSTRAINT fk_titles_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_titles_kind   CHECK (kind IN ('movie','book')),
  CONSTRAINT chk_titles_status CHECK (status IN ('draft','published','hidden')),
  CONSTRAINT chk_titles_year   CHECK (release_year BETWEEN 1850 AND 2100),
  CONSTRAINT chk_titles_runtime CHECK (runtime_min IS NULL OR runtime_min > 0),
  CONSTRAINT chk_titles_pages   CHECK (page_count IS NULL OR page_count > 0),
  CONSTRAINT chk_titles_kind_fields CHECK (
    (kind = 'movie' AND runtime_min IS NOT NULL AND page_count IS NULL) OR
    (kind = 'book'  AND page_count  IS NOT NULL AND runtime_min IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE title_genres (
  title_id BIGINT UNSIGNED NOT NULL,
  genre_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (title_id, genre_id),
  KEY idx_title_genres_genre (genre_id, title_id),
  CONSTRAINT fk_title_genres_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE,
  CONSTRAINT fk_title_genres_genre FOREIGN KEY (genre_id) REFERENCES genres (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE title_persons (
  title_id      BIGINT UNSIGNED NOT NULL,
  person_id     BIGINT UNSIGNED NOT NULL,
  credit_role   VARCHAR(16)     NOT NULL,
  billing_order TINYINT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (title_id, person_id, credit_role),
  KEY idx_title_persons_person (person_id, credit_role),
  CONSTRAINT fk_title_persons_title  FOREIGN KEY (title_id)  REFERENCES titles (id) ON DELETE CASCADE,
  CONSTRAINT fk_title_persons_person FOREIGN KEY (person_id) REFERENCES persons (id),
  CONSTRAINT chk_title_persons_role CHECK (credit_role IN ('director','actor','writer','author'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Moi nguoi mot diem cho mot tac pham: rang buoc duy nhat (user_id, title_id).
-- Cham lai = cap nhat ban ghi cu (INSERT ... ON DUPLICATE KEY UPDATE).
CREATE TABLE ratings (
  id         BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED  NOT NULL,
  title_id   BIGINT UNSIGNED  NOT NULL,
  score      TINYINT UNSIGNED NOT NULL,
  created_at DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ratings_user_title (user_id, title_id),
  KEY idx_ratings_title_score (title_id, score),
  KEY idx_ratings_created (created_at),
  CONSTRAINT fk_ratings_user  FOREIGN KEY (user_id)  REFERENCES users (id),
  CONSTRAINT fk_ratings_title FOREIGN KEY (title_id) REFERENCES titles (id),
  CONSTRAINT chk_ratings_score CHECK (score BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Noi dung binh luan luu nguyen ban; ma hoa dau ra theo ngu canh khi hien thi (BM2).
CREATE TABLE reviews (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  title_id     BIGINT UNSIGNED NOT NULL,
  body         TEXT            NOT NULL,
  status       VARCHAR(16)     NOT NULL DEFAULT 'pending',
  moderated_by BIGINT UNSIGNED NULL,
  moderated_at DATETIME        NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reviews_user_title (user_id, title_id),
  KEY idx_reviews_title_status_created (title_id, status, created_at),
  KEY idx_reviews_status_created (status, created_at),
  KEY idx_reviews_moderator (moderated_by),
  CONSTRAINT fk_reviews_user      FOREIGN KEY (user_id)      REFERENCES users (id),
  CONSTRAINT fk_reviews_title     FOREIGN KEY (title_id)     REFERENCES titles (id),
  CONSTRAINT fk_reviews_moderator FOREIGN KEY (moderated_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_reviews_status CHECK (status IN ('pending','approved','rejected','hidden')),
  CONSTRAINT chk_reviews_moderated CHECK (
    (status = 'pending' AND moderated_at IS NULL) OR
    (status <> 'pending' AND moderated_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- vote = 1 (huu ich) hoac -1 (khong huu ich). Moi nguoi mot phieu cho mot binh luan.
-- Quy tac nghiep vu o tang service: khong tu binh chon binh luan cua minh.
CREATE TABLE review_votes (
  review_id  BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  vote       TINYINT         NOT NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id, user_id),
  KEY idx_review_votes_user (user_id),
  CONSTRAINT fk_review_votes_review FOREIGN KEY (review_id) REFERENCES reviews (id) ON DELETE CASCADE,
  CONSTRAINT fk_review_votes_user   FOREIGN KEY (user_id)   REFERENCES users (id),
  CONSTRAINT chk_review_votes_vote CHECK (vote IN (1, -1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE watchlists (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id   BIGINT UNSIGNED NOT NULL,
  title_id  BIGINT UNSIGNED NOT NULL,
  list_type VARCHAR(16)     NOT NULL DEFAULT 'want',
  added_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_watchlists_user_title (user_id, title_id),
  KEY idx_watchlists_user_type_added (user_id, list_type, added_at),
  KEY idx_watchlists_title (title_id),
  CONSTRAINT fk_watchlists_user  FOREIGN KEY (user_id)  REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_watchlists_title FOREIGN KEY (title_id) REFERENCES titles (id),
  CONSTRAINT chk_watchlists_type CHECK (list_type IN ('want','watching','done'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE reports (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  review_id   BIGINT UNSIGNED NOT NULL,
  reporter_id BIGINT UNSIGNED NOT NULL,
  reason      VARCHAR(16)     NOT NULL,
  detail      VARCHAR(500)    NULL,
  status      VARCHAR(16)     NOT NULL DEFAULT 'open',
  handled_by  BIGINT UNSIGNED NULL,
  handled_at  DATETIME        NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reports_review_reporter (review_id, reporter_id),
  KEY idx_reports_status_created (status, created_at),
  KEY idx_reports_reporter (reporter_id),
  KEY idx_reports_handler (handled_by),
  CONSTRAINT fk_reports_review   FOREIGN KEY (review_id)   REFERENCES reviews (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id),
  CONSTRAINT fk_reports_handler  FOREIGN KEY (handled_by)  REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_reports_reason CHECK (reason IN ('spam','offensive','spoiler','off_topic','other')),
  CONSTRAINT chk_reports_status CHECK (status IN ('open','resolved','dismissed')),
  CONSTRAINT chk_reports_handled CHECK (
    (status = 'open' AND handled_at IS NULL) OR
    (status <> 'open' AND handled_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cot tong hop duy tri san cho moi tac pham (phuong an doi chung voi tinh khi doc).
CREATE TABLE aggregates (
  title_id       BIGINT UNSIGNED NOT NULL,
  rating_count   INT UNSIGNED    NOT NULL DEFAULT 0,
  rating_sum     INT UNSIGNED    NOT NULL DEFAULT 0,
  rating_avg     DECIMAL(4,2)    NULL,
  weighted_score DECIMAL(6,4)    NOT NULL DEFAULT 0,
  review_count   INT UNSIGNED    NOT NULL DEFAULT 0,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (title_id),
  KEY idx_aggregates_rank (weighted_score DESC, title_id),
  KEY idx_aggregates_count (rating_count),
  CONSTRAINT fk_aggregates_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE,
  CONSTRAINT chk_aggregates_avg CHECK (
    (rating_count = 0 AND rating_avg IS NULL) OR
    (rating_count > 0 AND rating_avg IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Nhat ky tai len tep (anh bia). mime_detected la kieu tep xac dinh theo chu ky
-- tep (magic bytes), khong tin vao phan mo rong hay Content-Type cua client (BM8).
CREATE TABLE files (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id      BIGINT UNSIGNED NOT NULL,
  title_id      BIGINT UNSIGNED NULL,
  purpose       VARCHAR(16)     NOT NULL DEFAULT 'poster',
  original_name VARCHAR(255)    NOT NULL,
  stored_name   VARCHAR(80)     NOT NULL,
  mime_detected VARCHAR(64)     NOT NULL,
  size_bytes    INT UNSIGNED    NOT NULL,
  sha256        CHAR(64)        NOT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_files_stored (stored_name),
  KEY idx_files_title (title_id),
  KEY idx_files_owner_created (owner_id, created_at),
  CONSTRAINT fk_files_owner FOREIGN KEY (owner_id) REFERENCES users (id),
  CONSTRAINT fk_files_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE SET NULL,
  CONSTRAINT chk_files_purpose CHECK (purpose IN ('poster')),
  CONSTRAINT chk_files_size CHECK (size_bytes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_logs (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NULL,
  action     VARCHAR(64)     NOT NULL,
  entity     VARCHAR(64)     NOT NULL,
  entity_id  BIGINT UNSIGNED NULL,
  ip         VARCHAR(45)     NULL,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_user_created (user_id, created_at),
  KEY idx_audit_logs_entity (entity, entity_id),
  KEY idx_audit_logs_action_created (action, created_at),
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
