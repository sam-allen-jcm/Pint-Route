-- User accounts (email + password). Logging in is optional: crawls without an
-- owner keep working with their private edit token, as before.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,                   -- pbkdf2-sha256$<iterations>$<salt>$<hash>
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  id          TEXT    PRIMARY KEY,                  -- SHA-256 of the session cookie value
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT    NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions (user_id);

-- A crawl's owner can edit it from any device they're logged in on.
ALTER TABLE crawls ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_crawls_owner ON crawls (owner_id, updated_at);
