-- Round Trip schema.
-- Per Google Maps Platform terms we store ONLY Place IDs plus our own data
-- (crawl names, stop order, visits, notes). Names, hours, status and photos are
-- always fetched live from Places API via the Worker.

CREATE TABLE crawls (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT    NOT NULL UNIQUE,          -- public, read-only share id
  name            TEXT    NOT NULL,
  edit_token_hash TEXT    NOT NULL,                 -- SHA-256 of the private edit token
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE stops (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  crawl_id    INTEGER NOT NULL REFERENCES crawls(id) ON DELETE CASCADE,
  place_id    TEXT    NOT NULL,                     -- Google Place ID only
  position    INTEGER NOT NULL,
  visited_on  TEXT,                                 -- YYYY-MM-DD, NULL = not visited
  note        TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_stops_crawl_position ON stops (crawl_id, position);
