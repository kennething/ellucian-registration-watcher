import sqlite3 from "sqlite3";
import { open } from "sqlite";

// you would have to import / invoke this in another file
export async function openDb() {
  return open({
    filename: "./server/db.sqlite3",
    driver: sqlite3.cached.Database
  });
}
