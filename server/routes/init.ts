import { toCamelCase, truncateClassData } from "~/utils/functions";
import { searchClasses, tryCatch } from "~/utils/fetch";
import { ClientManager } from "~/utils/clientManager";
import { authController } from "../controllers/auth";
import { NotificationType } from "~/utils/types";
import { botClient } from "~/bot/common";
import { Router } from "express";
import { db } from "~/db";

const router = Router();

router.get("/", authController, async (req, res) => {
  const [userSettings, error] = tryCatch<{ web_theme: number; notify_new_terms: number; notify_stale_terms: number; notify_default_watchers: number }>(
    () => db.prepare("SELECT * FROM user_settings WHERE uuid = ?").get(req.user.uuid) as any
  );
  if (error || !userSettings) return res.sendStatus(500);

  const [watchers, error2] = tryCatch<{ uuid: string; term_id: string; is_active: number; crn: string; notify_when: NotificationType; notify_when_value: number }[]>(
    () => db.prepare("SELECT uuid, term_id, is_active, crn, notify_when, notify_when_value FROM watchers WHERE owner_uuid = ?").all(req.user.uuid) as any
  );
  if (error2 || !watchers) return res.sendStatus(500);

  const [schedules, error3] = tryCatch<{ uuid: string; term_id: string; name: string; crns: string }[]>(
    () =>
      db
        .prepare(
          `SELECT 
        s.uuid,
        s.term_id,
        s.name,
        COALESCE(json_group_array(sc.crn) FILTER (WHERE sc.crn IS NOT NULL), '[]') AS crns
    FROM schedules s
    LEFT JOIN schedule_crns sc ON s.uuid = sc.uuid
    WHERE s.owner_uuid = ?
    GROUP BY s.uuid`
        )
        .all(req.user.uuid) as any
  );
  if (error3 || !schedules) return res.sendStatus(500);

  const terms = Array.from(new Set(watchers.map((watcher) => watcher.term_id)));
  const classes = await Promise.all(
    terms.map(async (term) => {
      const data = await searchClasses(term, { crn: watchers.filter((watcher) => watcher.term_id === term).map((watcher) => watcher.crn) });
      return truncateClassData(data[0]);
    })
  );

  const watchersWithData = watchers.map((watcher) => {
    const data = classes[terms.findIndex((term) => term === watcher.term_id)];

    return {
      ...toCamelCase(watcher),
      isActive: Boolean(watcher.is_active),
      hasData: Boolean(data?.get(watcher.crn)),
      ...data?.get(watcher.crn)
    };
  });

  db.prepare("UPDATE users SET is_installed = 1 WHERE uuid = ?").run(req.user.uuid); // theyll log in again eventually :shipit:

  const discordUser = await botClient.client?.users.fetch(req.user.discordId);
  res.status(200).json({
    user: {
      uuid: req.user.uuid,
      discordId: req.user.discordId,
      displayName: discordUser?.displayName,
      username: discordUser?.username,
      avatar: discordUser?.avatar,
      settings: {
        /** 0 = system, 1 = light, 2 = dark */
        theme: userSettings.web_theme,
        notifications: {
          /** enabled/disabled */
          newTerms: Boolean(userSettings.notify_new_terms),
          /** enabled/disabled */
          staleTerms: Boolean(userSettings.notify_stale_terms),
          /** enabled/disabled */
          defaultWatchers: Boolean(userSettings.notify_default_watchers)
        }
      }
    },
    validTerms: ClientManager.terms.map((term) => ({ termId: term.termId, isEarly: term.isEarly })),
    attributes: ClientManager.attributes.map((attribute) => ({ code: attribute.code, name: attribute.name })),
    subjects: ClientManager.subjects,
    locations: ClientManager.locations,
    watchers: toCamelCase(watchersWithData),
    schedules: toCamelCase(schedules.map((schedule) => ({ ...schedule, crns: JSON.parse(schedule.crns) })))
  });
});

export default router;
