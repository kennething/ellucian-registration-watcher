import Database from "better-sqlite3";
import ENV from "../../env";
import path from "path";

export const db = new Database(path.resolve(ENV.DATABASE_PATH), { fileMustExist: true });
db.pragma("journal_mode = WAL");

process.on("exit", () => db.close());
