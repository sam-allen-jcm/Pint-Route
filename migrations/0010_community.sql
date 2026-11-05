-- Public usernames, public ("community") crawls, copies and star ratings.

-- Shown publicly on crawls a user makes public. Chosen at sign-up or generated
-- (existing accounts get one generated the next time they use the app).
ALTER TABLE users ADD COLUMN username TEXT;
CREATE UNIQUE INDEX idx_users_username ON users (username COLLATE NOCASE);

-- Owner-controlled: listed in the Community area when 1.
ALTER TABLE crawls ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crawls ADD COLUMN published_at TEXT;
-- How many times other people copied this crawl into their own account.
ALTER TABLE crawls ADD COLUMN copy_count INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_crawls_public ON crawls (is_public, published_at);

-- One 1-5 star rating per user per crawl. Only the average and count are shown.
CREATE TABLE ratings (
  crawl_id   INTEGER NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars      INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (crawl_id, user_id)
);
CREATE INDEX idx_ratings_user ON ratings (user_id);
