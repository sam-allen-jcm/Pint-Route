-- Optional start date/time (local wall-clock time at the crawl, "YYYY-MM-DDTHH:MM")
-- and how long to spend at each stop, used to estimate arrival times and check
-- whether each pub will be open then.
ALTER TABLE crawls ADD COLUMN starts_at TEXT;
ALTER TABLE crawls ADD COLUMN minutes_per_stop INTEGER;
