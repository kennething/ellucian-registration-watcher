import { Database } from "better-sqlite3";
import { timeNow } from "~/utils/time";
import { Log } from "~/utils/log";
import path from "path";
import fs from "fs";

export function runMigrations(db: Database) {
  // 1. Ensure the tracking table exists
  db.exec(/* sql */ `
    CREATE TABLE IF NOT EXISTS _migrations (
        id         INTEGER PRIMARY KEY AUTOINCREMENT
                          NOT NULL,
        name       TEXT    NOT NULL
                          UNIQUE,
        applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare("SELECT name FROM _migrations").all() as { name: string }[];
  const appliedSet = new Set(appliedRows.map((row) => row.name));

  const migrationsDir = path.join(import.meta.dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) fs.mkdirSync(migrationsDir, { recursive: true });

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const recordMigration = db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)");

  for (const file of migrationFiles) {
    if (appliedSet.has(file)) continue;

    Log.debug(`Applying migration: ${file}`);
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf8");

    db.transaction(() => {
      db.exec(sql);
      recordMigration.run(file, timeNow());
    })();

    Log.debug(`Applied migration: ${file}`);
  }

  Log.info("All database migrations up to date");
}
