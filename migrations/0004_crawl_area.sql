-- Where a crawl is: the country (ISO 3166-1 alpha-2, our own data) and the
-- Google Place ID of the chosen town/city, or of the country when no town was
-- picked. Only the Place ID is stored; its location and name are fetched live.
ALTER TABLE crawls ADD COLUMN country_code TEXT;
ALTER TABLE crawls ADD COLUMN area_place_id TEXT;
