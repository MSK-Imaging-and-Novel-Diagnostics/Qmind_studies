CREATE TABLE IF NOT EXISTS docs (
  col        TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (col, id)
);

CREATE TABLE IF NOT EXISTS articles (
  pmid    INTEGER PRIMARY KEY,
  title   TEXT NOT NULL,
  authors TEXT NOT NULL DEFAULT '',
  journal TEXT NOT NULL DEFAULT '',
  year    INTEGER,
  pubdate TEXT NOT NULL DEFAULT '',
  volume  TEXT NOT NULL DEFAULT '',
  issue   TEXT NOT NULL DEFAULT '',
  pages   TEXT NOT NULL DEFAULT '',
  doi     TEXT NOT NULL DEFAULT '',
  ptypes  TEXT NOT NULL DEFAULT '',
  topic   TEXT NOT NULL DEFAULT '',
  found   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS articles_found ON articles (found DESC, pmid DESC);

CREATE TABLE IF NOT EXISTS article_reads (
  pmid    INTEGER NOT NULL,
  reader  TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (pmid, reader)
);

CREATE TABLE IF NOT EXISTS article_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
