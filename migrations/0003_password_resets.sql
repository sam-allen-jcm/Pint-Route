-- One-time password reset links. Only the SHA-256 of each token is stored.

CREATE TABLE password_resets (
  id          TEXT    PRIMARY KEY,                  -- SHA-256 of the token in the emailed link
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT    NOT NULL,
  used_at     TEXT
);

CREATE INDEX idx_password_resets_user ON password_resets (user_id);
