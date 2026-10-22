import { hashToRange, waitForInterval } from "~/utils/functions";
import { ButtonStyle, ComponentType } from "discord.js";
import { refreshConstantData } from "~/db/refreshData";
import { ClientManager } from "~/utils/clientManager";
import { botClient } from "~/bot/common";
import { tryCatch } from "~/utils/fetch";
import { timeNow } from "~/utils/time";
import { Log } from "~/utils/log";
import ENV from "~/utils/env";
import { db } from "~/db";
import path from "path";
import fs from "fs";

export function purgeOutdatedLoop(): void {
  waitForInterval(ENV.OUTDATED_PURGE_INTERVAL, ENV.OUTDATED_PURGE_OFFSET, async () => {
    const mostRecentTermStrings = ClientManager.terms.map((term) => term.getTermString());

    const termsToDelete = db.prepare("SELECT term_id FROM terms WHERE delete_timestamp < ?").all(timeNow()) as { term_id: string }[];

    if (termsToDelete.length) {
      const backupPath = path.join(ENV.BACKUP_DATABASE_PATH, `backup_${timeNow()}.sqlite3`);
      if (!fs.existsSync(backupPath)) fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      await db.backup(backupPath);
      Log.info(`Backed up database before purging to ${backupPath}`);

      db.transaction(() => {
        for (const { term_id: termId } of termsToDelete) {
          // * outdated watchers
          const { changes: watchersDeleted } = db.prepare("DELETE FROM watchers WHERE term_id = ?").run(termId);
          Log.debug(`Purged ${watchersDeleted} outdated watchers for term ${termId}`);

          // * outdated schedules
          const { changes: schedulesDeleted } = db.prepare("DELETE FROM schedules WHERE term_id = ?").run(termId);
          Log.debug(`Purged ${schedulesDeleted} outdated schedules for term ${termId}`);

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

    let outdatedTerms = allTerms.filter((term) => !ClientManager.terms.some((t) => t.termId === term.term_id));
    if (!outdatedTerms.length) return;

    const alreadyDeletingTerms = db.prepare("SELECT term_id FROM terms WHERE delete_timestamp IS NOT NULL").all() as { term_id: string }[];
    outdatedTerms = outdatedTerms.filter((term) => !alreadyDeletingTerms.some((t) => t.term_id === term.term_id));
    if (!outdatedTerms.length) return;

    db.prepare("UPDATE terms SET delete_timestamp = ? WHERE term_id IN (" + outdatedTerms.map(() => "?").join(",") + ")").run(
      timeNow() + ENV.WATCHER_PURGE_NOTICE,
      ...outdatedTerms.map((term) => term.term_id)
    );

    const [usersToNotify, error2] = tryCatch<{ owner_uuid: string }[]>(
      () =>
        db
          .prepare(
            `SELECT DISTINCT owner_uuid 
            FROM watchers 
            WHERE (
              SELECT notify_stale_terms 
              FROM user_settings
              WHERE user_settings.uuid = watchers.owner_uuid
            ) = 1
            AND (
              SELECT is_installed
              FROM users
              WHERE users.uuid = watchers.owner_uuid
            ) = 1
            AND term_id IN (${outdatedTerms.map(() => "?").join(",")})`
          )
          .all(...outdatedTerms.map((term) => term.term_id)) as any
    );
    if (error2) return Log.error(error2);

    const purgeTime = timeNow() + ENV.WATCHER_PURGE_NOTICE;
    for (const user of usersToNotify) {
      const [{ discord_id: discordId }, error] = tryCatch<{ discord_id: string }>(() => db.prepare("SELECT discord_id FROM users WHERE uuid = ?").get(user.owner_uuid) as any);
      if (error) continue;

      setTimeout(
        async () => {
          const discordUser = await botClient.client?.users.fetch(discordId);
          if (!discordUser) return;

          try {
            await discordUser?.send({
              embeds: [
                {
                  title: "Your outdated watchers are being removed",
                  description: `One or more of your watchers is for an outdated term and will be automatically deleted <t:${purgeTime}:R>.\n\nWatchers for the **${mostRecentTermStrings.join(" and ")}** term${mostRecentTermStrings.length > 1 ? "s" : ""} will not be affected.`,
                  color: ENV.ERROR_COLOR,
                  footer: { text: "No action is required from you" },
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
          } catch (error) {
            tryCatch(() => db.prepare("UPDATE users SET is_installed = 0 WHERE discord_id = ?").run(discordId));
          }
        },
        hashToRange(discordId, ENV.CLASS_FETCH_INTERVAL, ENV.NOTIFICATION_BUCKET_SIZE) * 1000
      );
    }

    Log.info(`Purging ${outdatedTerms.map((term) => term.term_id).join(", ")} at ${new Date(purgeTime * 1000).toLocaleString()}`);

    // * notify new terms
    {
      const newTerms = await refreshConstantData(db);
      if (!newTerms.length) return;

      const [usersToNotify, error] = tryCatch<{ uuid: string; discord_id: string }[]>(
        () => db.prepare(`SELECT uuid, discord_id FROM users WHERE is_installed = 1 AND (SELECT notify_new_terms FROM user_settings WHERE user_settings.uuid = users.uuid) = 1`).all() as any
      );
      if (error) return Log.error(error);

      for (const user of usersToNotify) {
        setTimeout(
          async () => {
            const discordUser = await botClient.client?.users.fetch(user.discord_id);
            if (!discordUser) return;

            try {
              discordUser?.send({
                embeds: [
                  {
                    title: `${newTerms.map((term) => term.getTermString()).join(" and ")} ${newTerms.length === 1 ? "is" : "are"} now available early`,
                    description: `We've been digging in the trash and we found ${newTerms.map((term) => term.getTermString()).join(" and ")} sitting there!`,
                    color: ENV.PRIMARY_COLOR,
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
                            label: "Start scheduling now",
                            url: `${ENV.FRONTEND_URL}/schedule`
                          }
                        ]
                      }
                    ]
                  : undefined
              });
            } catch (error) {
              tryCatch(() => db.prepare("UPDATE users SET is_installed = 0 WHERE discord_id = ?").run(user.discord_id));
            }
          },
          hashToRange(user.discord_id, ENV.CLASS_FETCH_INTERVAL, ENV.NOTIFICATION_BUCKET_SIZE) * 1000
        );
      }
    }
  });
}
