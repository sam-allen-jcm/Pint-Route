-- Optional meeting point before the first stop (any place, not just pubs).
-- Only the Google Place ID is stored; its name and location are fetched live.
ALTER TABLE crawls ADD COLUMN meet_place_id TEXT;
