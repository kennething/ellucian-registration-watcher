import { refreshConstantData } from "./refreshData";
import { runMigrations } from "./migrate";
import Database from "better-sqlite3";
import { Log } from "../utils/log";
import ENV from "../utils/env";
import path from "path";
import fs from "fs";

const dbPath = path.resolve(ENV.DATABASE_PATH);

if (!fs.existsSync(dbPath)) {
  Log.warn(`Database file not found at ${dbPath}. Creating a new database file.`);
  fs.writeFileSync(dbPath, "");
}

export const db = new Database(dbPath, { fileMustExist: true });
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

process.on("exit", () => {
  if (db.open) db.close();
  Log.debug("closed db connection");
});
process.on("SIGINT", () => process.exit());
process.on("SIGTERM", () => process.exit());

db.pragma("foreign_keys = OFF");
runMigrations(db);
db.pragma("foreign_keys = ON");
await refreshConstantData(db);

Log.debug("initiated db connection");
