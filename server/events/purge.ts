import { ClientManager } from "../utils/clientManager";
import { waitForInterval } from "../utils/functions";
import { botClient } from "../../bot/src/common";
import { tryCatch } from "../utils/fetch";
import { timeNow } from "../utils/time";
import { db } from "../utils/sqlite";
import { Log } from "../utils/log";
import ENV from "../../env";
import path from "path";

export function purgeOutdatedLoop(): void {
  waitForInterval(ENV.OUTDATED_PURGE_INTERVAL, ENV.OUTDATED_PURGE_OFFSET, async () => {
    const mostRecentTermStrings = ClientManager.terms.map((term) => term.getTermString());

    const termsToDelete = db.prepare("SELECT term_id FROM watchers GROUP BY term_id HAVING delete_timestamp < ?").all(timeNow()) as { term_id: string }[];

    if (termsToDelete.length) {
      const backupPath = path.join(ENV.BACKUP_DATABASE_PATH, `backup_${timeNow()}.sqlite3`);
      await db.backup(backupPath);
      Log.info(`${new Date().toLocaleString()}: Backed up database before purging to ${backupPath}`);

      for (const { term_id: termId } of termsToDelete) {
        // * outdated watchers
        const { count } = db.prepare("DELETE FROM watchers WHERE term_id = ? RETURNING COUNT(*) as count").get(termId) as { count: number };
        Log.info(`${new Date().toLocaleString()}: Purged ${count} outdated watchers for term ${termId}`);

        // * outdated search db
        db.prepare(`DROP TABLE IF EXISTS "${termId}_search_db"`).run();
        db.prepare(`DROP TABLE IF EXISTS "${termId}_search_db_attributes"`).run();
        Log.info(`${new Date().toLocaleString()}: Dropped search db table for term ${termId}`);

        // * outdated math schedules
        if (ENV.MATH_SCHEDULE_URL) {
          db.prepare(`DROP TABLE IF EXISTS "${termId}_math_schedule"`).run();
          Log.info(`${new Date().toLocaleString()}: Dropped math schedule table for term ${termId}`);
        }
      }

      return;
    }

    const [allTerms, error] = tryCatch<{ term_id: string }[]>(db.prepare("SELECT DISTINCT term_id FROM watchers").all() as any);
    if (error) return;

    const outdatedTerms = allTerms.filter((term) => !ClientManager.terms.some((t) => t.termId === term.term_id));
    if (!outdatedTerms.length) return;

    const [usersToNotify, error2] = tryCatch<{ owner_uuid: string }[]>(
      db.prepare(`SELECT DISTINCT owner_uuid FROM watchers WHERE term_id IN (${outdatedTerms.map(() => "?").join(",")})`).all(...outdatedTerms.map((term) => term.term_id)) as any
    );
    if (error2) return;

    for (const user of usersToNotify) {
      const [{ discord_id: discordId }, error] = tryCatch<{ discord_id: string }>(() => db.prepare("SELECT discord_id FROM users WHERE uuid = ?").get(user.owner_uuid) as any);
      if (error) return;

      const discordUser = await botClient.client?.users.fetch(discordId);
      discordUser?.send({
        embeds: [
          {
            title: "A watcher is being removed",
            description: `One or more of your watchers is for an outdated term and will be automatically deleted <t:${timeNow() + ENV.WATCHER_PURGE_NOTICE}:R>.\nWatchers for the ${mostRecentTermStrings.join(" and ")} term${mostRecentTermStrings.length > 1 ? "s" : ""} will not be affected.`,
            color: ENV.ERROR_COLOR,
            footer: { text: "No action is required from you." },
            timestamp: new Date().toISOString()
          }
        ]
      });
    }

    Log.info(`Purging ${outdatedTerms.join(", ")} at ${new Date(timeNow() + ENV.WATCHER_PURGE_NOTICE).toLocaleString()}`);
  });
}
