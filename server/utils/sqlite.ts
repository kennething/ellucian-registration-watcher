import Database from "better-sqlite3";
import ENV from "../../env";
import { Log } from "./log";
import path from "path";
import fs from "fs";

const dbPath = path.resolve(ENV.DATABASE_PATH);

if (!fs.existsSync(dbPath)) {
  Log.warn(`Database file not found at ${dbPath}. Creating a new database file.`);
  fs.writeFileSync(dbPath, "");
}

export const db = new Database(dbPath, { fileMustExist: true });
db.pragma("journal_mode = WAL");
process.on("exit", () => db.close());

db.exec(/* sql */ `
CREATE TABLE IF NOT EXISTS terms (
  term_id    TEXT    PRIMARY KEY
                      UNIQUE
                      NOT NULL,
  is_primary INTEGER NOT NULL,
  is_early   INTEGER NOT NULL
                      DEFAULT (0) 
);

CREATE TABLE IF NOT EXISTS subjects (
  name TEXT NOT NULL,
  code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attributes (
    name TEXT NOT NULL,
    code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS course_history (
  crn             TEXT    PRIMARY KEY
                          UNIQUE
                          NOT NULL,
  term_id         TEXT    NOT NULL,
  [24h_timestamp] INTEGER NOT NULL,
  [7d_timestamp]  INTEGER NOT NULL,
  [28d_timestamp] INTEGER NOT NULL,
  seat_24h        ARRAY   NOT NULL,
  seat_7d         ARRAY   NOT NULL,
  seat_28d        ARRAY   NOT NULL,
  wait_24h        ARRAY,
  wait_7d         ARRAY,
  wait_28d        ARRAY
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
  term_id    TEXT    NOT NULL,
  crns       ARRAY
);

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
`);
Log.debug("initiated db connection");
