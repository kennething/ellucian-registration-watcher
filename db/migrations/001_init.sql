CREATE TABLE IF NOT EXISTS terms (
  term_id    TEXT    PRIMARY KEY
                      UNIQUE
                      NOT NULL,
  is_primary INTEGER NOT NULL,
  is_early   INTEGER NOT NULL
                      DEFAULT (0),
  delete_timestamp INTEGER
);

CREATE TABLE IF NOT EXISTS subjects (
  name TEXT NOT NULL,
  code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attributes (
    name       TEXT    NOT NULL,
    code       TEXT    NOT NULL,
    is_special INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
    short TEXT NOT NULL,
    long  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_history (
  crn             TEXT    PRIMARY KEY
                          UNIQUE
                          NOT NULL,
  term_id         TEXT    NOT NULL,
  [24h_timestamp] INTEGER NOT NULL,
  [7d_timestamp]  INTEGER NOT NULL,
  [28d_timestamp] INTEGER NOT NULL,
  seat_24h        TEXT   NOT NULL, -- json array
  seat_7d         TEXT   NOT NULL, -- json array
  seat_28d        TEXT   NOT NULL, -- json array
  wait_24h        TEXT,            -- json array
  wait_7d         TEXT,            -- json array
  wait_28d        TEXT             -- json array
);

CREATE TABLE IF NOT EXISTS professors (
  school_id           INTEGER NOT NULL
                              PRIMARY KEY
                              UNIQUE,
  school_name         TEXT    NOT NULL,
  rmp_id              INTEGER,
  rmp_name            TEXT,
  overall_rating      REAL,
  num_ratings         INTEGER,
  percent_take_again  REAL,
  level_of_difficulty REAL
);

CREATE TABLE IF NOT EXISTS schedules (
  uuid       TEXT    NOT NULL
                      UNIQUE
                      PRIMARY KEY,
  owner_uuid TEXT    NOT NULL
                      REFERENCES users (uuid) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  name       TEXT    NOT NULL,
  term_id    TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS schedule_crns (
    uuid TEXT NOT NULL
              REFERENCES schedules (uuid) ON DELETE CASCADE,
    crn  TEXT NOT NULL,
    PRIMARY KEY (uuid, crn)
);
CREATE INDEX IF NOT EXISTS idx_schedule_crns_crn ON schedule_crns(crn);

CREATE TABLE IF NOT EXISTS users (
  uuid       TEXT    NOT NULL
                      UNIQUE
                      PRIMARY KEY,
  discord_id TEXT    NOT NULL
                      UNIQUE,
  created_at INTEGER NOT NULL,
  web_theme  INTEGER DEFAULT (0) 
                      NOT NULL
);

CREATE TABLE IF NOT EXISTS watchers (
  uuid              TEXT    UNIQUE
                            PRIMARY KEY
                            NOT NULL,
  owner_uuid        TEXT    NOT NULL
                            REFERENCES users (uuid) ON DELETE CASCADE,
  is_active         INTEGER NOT NULL,
  last_notified     INTEGER,
  created_at        INTEGER NOT NULL,
  term_id           TEXT    NOT NULL,
  crn               TEXT    NOT NULL,
  notify_when       INTEGER NOT NULL,
  notify_when_value INTEGER NOT NULL
);
