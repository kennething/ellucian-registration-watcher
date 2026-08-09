import Database from "better-sqlite3";

export const db = new Database(`./server/db.sqlite3`);
db.pragma("journal_mode = WAL");
