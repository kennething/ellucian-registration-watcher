import { ClientManager } from "../utils/clientManager";
import { waitForInterval } from "../utils/functions";
import { getMathSchedule } from "../utils/math";
import { db } from "../utils/sqlite";
import { Log } from "../utils/log";
import ENV from "../../env";

export function fetchMathScheduleLoop(): void {
  waitForInterval(ENV.MATH_FETCH_INTERVAL, ENV.MATH_FETCH_OFFSET, async () => {
    for (const term of ClientManager.getMostRecentTerms() ?? []) {
      const professors = await getMathSchedule(term.slice(0, -1));

      db.transaction(() => {
        db.prepare(`DROP TABLE IF EXISTS "${term}_math_schedule"`).run();
        db.prepare(`CREATE TABLE "${term}_math_schedule" (crn TEXT PRIMARY KEY UNIQUE, professor TEXT)`).run();

        const statement = db.prepare(`INSERT INTO "${term}_math_schedule" (crn, professor) VALUES (?, ?)`);
        for (const professor of professors) statement.run(...professor);
      })();

      Log.info(`Fetched ${professors.size} professors from Math for term ${term}`);
    }
  });
}
