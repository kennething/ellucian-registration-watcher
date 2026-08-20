import { toCamelCase, truncateClassData } from "../utils/functions";
import { fetchClasses, tryCatch } from "../utils/fetch";
import { authController } from "../controllers/auth";
import { NotificationType } from "../utils/types";
import { CLIENT } from "../../bot/src/common";
import { Cookie } from "../utils/cookie";
import { db } from "../utils/sqlite";
import { Router } from "express";
import ENV from "../../env";

const router = Router();

router.get("/", authController, async (req, res) => {
  const user = await CLIENT.client?.users.fetch(req.user.discordId);
  if (ENV.DISCORD_TOKEN && !user) return res.status(400).json({ error: "App not authorized on Discord" });

  const [userSettings, error] = tryCatch<{ web_theme: number }>(() => db.prepare("SELECT web_theme FROM users WHERE uuid = ?").get(req.user.uuid) as any);
  if (error) return res.sendStatus(500);

  const [watchers, error2] = tryCatch<{ uuid: string; term_id: string; is_active: number; crn: string; notify_when: NotificationType; notify_when_value: number }[]>(
    () => db.prepare("SELECT uuid, term_id, is_active, crn, notify_when, notify_when_value FROM watchers WHERE owner_uuid = ?").all(req.user.uuid) as any
  );
  if (error2) return res.sendStatus(500);

  const [schedules, error3] = tryCatch<{ uuid: string; term_id: string; name: string; crns: string }[]>(
    () => db.prepare("SELECT uuid, term_id, name, crns FROM schedules WHERE owner_uuid = ?").all(req.user.uuid) as any
  );
  if (error3) return res.sendStatus(500);

  const terms = Array.from(new Set(watchers.map((watcher) => watcher.term_id)));
  const classes = await Promise.all(
    terms.map(async (term) => {
      const data = await fetchClasses(term, new Set(watchers.filter((watcher) => watcher.term_id === term).map((watcher) => watcher.crn)));
      return truncateClassData(data);
    })
  );

  const watchersWithData = watchers.map((watcher) => ({
    ...toCamelCase(watcher),
    isActive: Boolean(watcher.is_active),
    ...classes[terms.findIndex((term) => term === watcher.term_id)]?.get(watcher.crn)
  }));

  res.status(200).json({
    user: {
      uuid: req.user.uuid,
      discordId: req.user.discordId,
      displayName: user?.displayName,
      username: user?.username,
      avatar: user?.avatar,
      settings: {
        theme: userSettings.web_theme
      }
    },
    validTerms: Cookie.getMostRecentTerms(),
    attributes: Cookie.attributes,
    subjects: Cookie.subjects,
    watchers: toCamelCase(watchersWithData),
    schedules: toCamelCase(schedules.map((schedule) => ({ ...schedule, crns: JSON.parse(schedule.crns) })))
  });
});

export default router;
