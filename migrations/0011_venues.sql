-- Our own directory of UK pubs, bars, taprooms and clubs.
--
-- Seeded from the Food Standards Agency's food hygiene rating data (Open
-- Government Licence v3.0: free to store and reuse, with attribution). These are
-- business listings, not user data. Google is linked only by Place ID (which
-- Google's terms let us store); Google's names, hours and photos are fetched live
-- and never stored here.

CREATE TABLE venues (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  slug                 TEXT    NOT NULL UNIQUE,          -- /v/<slug>
  name                 TEXT    NOT NULL,
  kind                 TEXT    NOT NULL DEFAULT 'pub',   -- pub | bar | taproom | nightclub | club
  address              TEXT    NOT NULL DEFAULT '',      -- address lines, comma separated
  town                 TEXT,
  postcode             TEXT,
  outcode              TEXT,                             -- first half of the postcode, e.g. RG1
  local_authority      TEXT,
  lat                  REAL,
  lng                  REAL,
  fsa_id               INTEGER UNIQUE,                   -- FHRSID
  fsa_authority_id     INTEGER,
  hygiene_rating       TEXT,                             -- "5", "Pass", "AwaitingInspection", …
  hygiene_rating_date  TEXT,
  google_place_id      TEXT,                             -- linked on first view; '' = no match found
  google_checked_at    TEXT,
  status               TEXT    NOT NULL DEFAULT 'active', -- active | closed | hidden
  source               TEXT    NOT NULL DEFAULT 'fsa',
  seen_at              TEXT,                             -- last time it appeared in an import
  created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_venues_outcode ON venues (outcode, status);
CREATE INDEX idx_venues_town ON venues (town COLLATE NOCASE, status);
CREATE INDEX idx_venues_authority ON venues (local_authority COLLATE NOCASE, status);
CREATE INDEX idx_venues_fsa_authority ON venues (fsa_authority_id);
CREATE INDEX idx_venues_lat ON venues (lat);
CREATE INDEX idx_venues_place ON venues (google_place_id);

-- Full-text search over names and places, kept in step by the triggers below.
CREATE VIRTUAL TABLE venues_fts USING fts5(
  name, town, postcode, local_authority,
  content = 'venues', content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER venues_ai AFTER INSERT ON venues BEGIN
  INSERT INTO venues_fts (rowid, name, town, postcode, local_authority)
  VALUES (new.id, new.name, new.town, new.postcode, new.local_authority);
END;
CREATE TRIGGER venues_ad AFTER DELETE ON venues BEGIN
  INSERT INTO venues_fts (venues_fts, rowid, name, town, postcode, local_authority)
  VALUES ('delete', old.id, old.name, old.town, old.postcode, old.local_authority);
END;
CREATE TRIGGER venues_au AFTER UPDATE OF name, town, postcode, local_authority ON venues BEGIN
  INSERT INTO venues_fts (venues_fts, rowid, name, town, postcode, local_authority)
  VALUES ('delete', old.id, old.name, old.town, old.postcode, old.local_authority);
  INSERT INTO venues_fts (rowid, name, town, postcode, local_authority)
  VALUES (new.id, new.name, new.town, new.postcode, new.local_authority);
END;

-- Which council areas have been imported from the FSA, and when.
CREATE TABLE fsa_imports (
  authority_id  INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL,
  venue_count   INTEGER NOT NULL DEFAULT 0,
  imported_at   TEXT    NOT NULL
);
