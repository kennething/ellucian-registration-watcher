import { hashToRange, waitForInterval } from "../utils/functions";
import { db, refreshConstantData } from "../utils/sqlite";
import { ButtonStyle, ComponentType } from "discord.js";
import { ClientManager } from "../utils/clientManager";
import { botClient } from "../../bot/src/common";
import { tryCatch } from "../utils/fetch";
import { timeNow } from "../utils/time";
import { Log } from "../utils/log";
import ENV from "../../env";
import path from "path";

export function purgeOutdatedLoop(): void {
  waitForInterval(ENV.OUTDATED_PURGE_INTERVAL, ENV.OUTDATED_PURGE_OFFSET, async () => {
    const mostRecentTermStrings = ClientManager.terms.map((term) => term.getTermString());

    const termsToDelete = db.prepare("SELECT term_id FROM terms WHERE delete_timestamp < ?").all(timeNow()) as { term_id: string }[];

    if (termsToDelete.length) {
      const backupPath = path.join(ENV.BACKUP_DATABASE_PATH, `backup_${timeNow()}.sqlite3`);
      await db.backup(backupPath);
      Log.info(`Backed up database before purging to ${backupPath}`);

      db.transaction(() => {
        for (const { term_id: termId } of termsToDelete) {
          // * outdated watchers
          const { changes } = db.prepare("DELETE FROM watchers WHERE term_id = ?").run(termId);
          Log.debug(`Purged ${changes} outdated watchers for term ${termId}`);

          // * outdated search db
          db.prepare(`DROP TABLE IF EXISTS "${termId}_search_db"`).run();
          db.prepare(`DROP TABLE IF EXISTS "${termId}_search_db_attributes"`).run();
          Log.debug(`Dropped search db table for term ${termId}`);

          // * outdated math schedules
          if (ENV.MATH_SCHEDULE_URL) {
            db.prepare(`DROP TABLE IF EXISTS "${termId}_math_schedule"`).run();
            Log.debug(`Dropped math schedule table for term ${termId}`);
          }

          db.prepare("DELETE FROM terms WHERE term_id = ?").run(termId);
          Log.debug(`Purged term ${termId} from terms table`);
        }
      })();

      return Log.info(`Purged outdated terms: ${termsToDelete.map((term) => term.term_id).join(", ")}`);
    }

    const [allTerms, error] = tryCatch<{ term_id: string }[]>(() => db.prepare("SELECT DISTINCT term_id FROM watchers").all() as any);
    if (error) return Log.error(error);
    console.log("a ", allTerms);

    const outdatedTerms = allTerms.filter((term) => !ClientManager.terms.some((t) => t.termId === term.term_id));
    if (!outdatedTerms.length) return;
    console.log("b ", outdatedTerms);
    db.prepare("UPDATE terms SET delete_timestamp = ? WHERE term_id IN (" + outdatedTerms.map(() => "?").join(",") + ")").run(
      timeNow() + ENV.WATCHER_PURGE_NOTICE,
      ...outdatedTerms.map((term) => term.term_id)
    );

    const [usersToNotify, error2] = tryCatch<{ owner_uuid: string }[]>(
      () => db.prepare(`SELECT DISTINCT owner_uuid FROM watchers WHERE term_id IN (${outdatedTerms.map(() => "?").join(",")})`).all(...outdatedTerms.map((term) => term.term_id)) as any
    );
    if (error2) return Log.error(error2);

    const purgeTime = timeNow() + ENV.WATCHER_PURGE_NOTICE;
    for (const user of usersToNotify) {
      const [{ discord_id: discordId }, error] = tryCatch<{ discord_id: string }>(() => db.prepare("SELECT discord_id FROM users WHERE uuid = ?").get(user.owner_uuid) as any);
      if (error) return;

      setTimeout(
        async () => {
          const discordUser = await botClient.client?.users.fetch(discordId);
          discordUser?.send({
            embeds: [
              {
                title: "Your outdated watchers are being removed",
                description: `One or more of your watchers is for an outdated term and will be automatically deleted <t:${purgeTime}:R>.\n\nWatchers for the **${mostRecentTermStrings.join(" and ")}** term${mostRecentTermStrings.length > 1 ? "s" : ""} will not be affected.`,
                color: ENV.ERROR_COLOR,
                footer: { text: "No action is required from you." },
                timestamp: new Date().toISOString()
              }
            ],
            components: ENV.FRONTEND_URL
              ? [
                  {
                    type: ComponentType.ActionRow,
                    components: [
                      {
                        type: ComponentType.Button,
                        style: ButtonStyle.Link,
                        label: "View your watchers",
                        url: `${ENV.FRONTEND_URL}/watchers`
                      }
                    ]
                  }
                ]
              : undefined
          });
        },
        hashToRange(discordId, ENV.OUTDATED_PURGE_INTERVAL, ENV.NOTIFICATION_BUCKET_SIZE) * 1000
      );
    }

    Log.info(`Purging ${outdatedTerms.map((term) => term.term_id).join(", ")} at ${new Date(purgeTime * 1000).toLocaleString()}`);

    refreshConstantData();
  });
}
