CREATE TABLE IF NOT EXISTS notifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    BIGINT UNSIGNED NOT NULL,
  type       VARCHAR(32)     NOT NULL,
  message    VARCHAR(500)    NOT NULL,
  entity     VARCHAR(64)     NULL,
  entity_id  BIGINT UNSIGNED NULL,
  is_read    TINYINT(1)      NOT NULL DEFAULT 0,
  created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_user_read_created (user_id, is_read, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_notifications_type CHECK (type IN ('REVIEW_APPROVED','REVIEW_REJECTED','REVIEW_HIDDEN','REPORT_HANDLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SHOW TABLES LIKE 'notifications';
