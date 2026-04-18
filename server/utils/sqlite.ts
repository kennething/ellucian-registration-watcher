import Database from "better-sqlite3";

export const db = new Database(`./server/${process.env.NODE_ENV === "production" ? "prod" : "dev"}.sqlite3`);
db.pragma("journal_mode = WAL");
