-- Link-friendly town names for the "Browse by town" list and /pubs/<town> pages
-- ("Stoke-on-Trent" → "stoke-on-trent", "King's Lynn" → "kings-lynn").
-- Imports set it exactly; this backfills existing rows closely enough until the next import.
ALTER TABLE venues ADD COLUMN town_slug TEXT;

UPDATE venues SET town_slug =
  replace(replace(replace(replace(replace(replace(replace(replace(replace(
    lower(trim(town)), '''', ''), '’', ''), '.', ''), ',', ''), '(', ''), ')', ''), ' & ', ' and '), ' ', '-'), '--', '-')
WHERE town IS NOT NULL;

CREATE INDEX idx_venues_town_slug ON venues (town_slug, status);
