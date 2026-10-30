-- Evidence of what each account holder agreed to at registration.
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
