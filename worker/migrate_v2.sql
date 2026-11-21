-- One-off, for a database created before topics and own work existed. Run after schema.sql.
ALTER TABLE articles ADD COLUMN own INTEGER NOT NULL DEFAULT 0;
INSERT OR IGNORE INTO article_topics (pmid, topic) SELECT pmid, 'body-composition' FROM articles;
