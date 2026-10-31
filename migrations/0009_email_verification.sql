-- Email verification. A crawl's share link only works once its owner has
-- verified their email (stops spam links being shared from pintroute.com).

ALTER TABLE users ADD COLUMN email_verified_at TEXT;

-- Accounts that existed before verification was introduced are treated as verified.
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

CREATE TABLE email_verifications (
  id          TEXT    PRIMARY KEY,                  -- SHA-256 of the token in the emailed link
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT    NOT NULL
);

CREATE INDEX idx_email_verifications_user ON email_verifications (user_id);
