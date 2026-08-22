import { waitForInterval } from "../utils/functions";
import { CLIENT } from "../../bot/src/common";
import { tryCatch } from "../utils/fetch";
import { Cookie } from "../utils/cookie";
import { timeNow } from "../utils/time";
import { db } from "../utils/sqlite";
import ENV from "../../env";
import path from "path";

export function purgeOutdatedLoop(): void {
  const termStrings = {
    "10": "Winter",
    "20": "Spring",
    "60": "Summer",
    "90": "Fall"
  } as const;

  const termsToDelete = new Map<string, number>(); // Map<termId, timestampToDelete>
  waitForInterval(ENV.OUTDATED_PURGE_INTERVAL, ENV.OUTDATED_PURGE_OFFSET, async () => {
    const mostRecentTerms = Cookie.getMostRecentTerms();
    if (!mostRecentTerms) return;
    const mostRecentTermStrings: `${(typeof termStrings)[keyof typeof termStrings]} ${number}`[] = mostRecentTerms.map(
      (term) => `${termStrings[term.slice(-2) as keyof typeof termStrings]} ${term.slice(0, -2)}`
    ) as any;

    const isDeletingTerms = termsToDelete.size && Array.from(termsToDelete).some(([, deleteTimestamp]) => timeNow() >= deleteTimestamp);
    if (isDeletingTerms) {
      const backupPath = path.join(ENV.BACKUP_DATABASE_PATH, `backup_${timeNow()}.sqlite3`);
      await db.backup(backupPath);
      console.log(`${new Date().toLocaleString()}: Backed up database before purging to ${backupPath}`);

      for (const [termId] of termsToDelete) {
        // * outdated watchers
        const { count } = db.prepare("DELETE FROM watchers WHERE term_id = ? RETURNING COUNT(*) as count").get(termId) as { count: number };
        termsToDelete.delete(termId);
        console.log(`${new Date().toLocaleString()}: Purged ${count} outdated watchers for term ${termId}`);

        // * outdated search db
        db.prepare(`DROP TABLE IF EXISTS "${termId}_search_db"`).run();
        db.prepare(`DROP TABLE IF EXISTS "${termId}_search_db_attributes"`).run();
        console.log(`${new Date().toLocaleString()}: Dropped search db table for term ${termId}`);

        // * outdated math schedules
        if (ENV.MATH_SCHEDULE_URL) {
          db.prepare(`DROP TABLE IF EXISTS "${termId}_math_schedule"`).run();
          console.log(`${new Date().toLocaleString()}: Dropped math schedule table for term ${termId}`);
        }
      }

      termsToDelete.clear();
      return;
    }

    const [allTerms, error] = tryCatch<{ term_id: string }[]>(db.prepare("SELECT DISTINCT term_id FROM watchers").all() as any);
    if (error) return;

    const outdatedTerms = allTerms.filter((term) => !mostRecentTerms.includes(term.term_id));
    outdatedTerms.forEach((term) => termsToDelete.set(term.term_id, timeNow() + ENV.WATCHER_PURGE_NOTICE));
    if (!outdatedTerms.length) return;

    const [usersToNotify, error2] = tryCatch<{ owner_uuid: string }[]>(
      db.prepare(`SELECT DISTINCT owner_uuid FROM watchers WHERE term_id IN (${outdatedTerms.map(() => "?").join(",")})`).all(...outdatedTerms.map((term) => term.term_id)) as any
    );
    if (error2) return;

    for (const user of usersToNotify) {
      const [{ discord_id: discordId }, error] = tryCatch<{ discord_id: string }>(() => db.prepare("SELECT discord_id FROM users WHERE uuid = ?").get(user.owner_uuid) as any);
      if (error) return;

      const discordUser = await CLIENT.client?.users.fetch(discordId);
      discordUser?.send({
        embeds: [
          {
            title: "A watcher is being removed",
            description: `One or more of your watchers is for an outdated term and will be automatically deleted in 7 days.\nWatchers for the ${mostRecentTermStrings.join(" and ")} term${mostRecentTermStrings.length > 1 ? "s" : ""} will not be affected.`,
            color: ENV.ERROR_COLOR,
            footer: { text: "No action is required from you." },
            timestamp: new Date().toISOString()
          }
        ]
      });
    }

    console.log(`${new Date().toLocaleString()}: Purging ${outdatedTerms.join(", ")} in 7 days`);
  });
}
