-- Anonymous usage statistics: how many times each action happened per day.
-- Deliberately holds no user, session, IP or crawl identifiers.
CREATE TABLE usage_daily (
  day    TEXT    NOT NULL,             -- YYYY-MM-DD (UTC)
  event  TEXT    NOT NULL,             -- e.g. crawl_created, stop_added
  detail TEXT    NOT NULL DEFAULT '',  -- coarse breakdown, e.g. a country code
  count  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, detail)
);

-- How often a crawl has been opened by someone without edit rights (i.e. via a
-- shared link). A count only; who viewed it isn't recorded.
ALTER TABLE crawls ADD COLUMN shared_views INTEGER NOT NULL DEFAULT 0;
