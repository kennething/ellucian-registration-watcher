import { tryCatch } from "../utils/fetch";
import { Cookie } from "../utils/cookie";
import { db } from "../utils/sqlite";
import { v7 as uuidv7 } from "uuid";
import { Router } from "express";
import * as z from "zod";

const router = Router();

const WATCHER_LIMIT = 67 as const;

router.delete("/watchers/delete", async (req, res) => {
  const { data, error: parseError } = z
    .object({
      uuid: z.string(),
      watcherUuids: z.array(z.string())
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const { uuid, watcherUuids } = data;

  const [user, error] = tryCatch<{ uuid: string }>(() => db.prepare("SELECT uuid FROM users WHERE uuid = ?").get(uuid) as any);
  if (error) return res.sendStatus(500);
  if (!user) return res.status(404).json({ error: "User not found" });

  const deleteStatement = db.prepare(`DELETE FROM watchers WHERE uuid = ? AND owner_uuid = ?`);
  for (const watcherUuid of watcherUuids) {
    const [, error] = tryCatch(() => deleteStatement.run(watcherUuid, uuid));
    if (error) return res.sendStatus(500);
  }

  const [, error2] = tryCatch(() => db.prepare("UPDATE users SET num_watchers = num_watchers - ? WHERE uuid = ?").run(watcherUuids.length, uuid));
  if (error2) return res.sendStatus(500);

  res.sendStatus(200);
});

router.patch("/watchers/update", async (req, res) => {
  const { data, error: parseError } = z
    .object({
      uuid: z.string(),
      watchers: z.array(
        z.object({
          uuid: z.string(),
          newNotificationPriority: z.number().int().min(0).max(1),
          notifyWhen: z.number().int().min(0).max(3),
          notifyWhenValue: z.number().int()
        })
      )
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const { uuid, watchers } = data;

  const [user, error] = tryCatch<{ uuid: string }>(() => db.prepare("SELECT uuid FROM users WHERE uuid = ?").get(uuid) as any);
  if (error) return res.sendStatus(500);
  if (!user) return res.status(404).json({ error: "User not found" });

  const updateStatement = db.prepare(`UPDATE watchers SET notification_priority = ?, notify_when = ?, notify_when_value = ? WHERE uuid = ? AND owner_uuid = ?`);

  for (const watcher of watchers) {
    const [, error] = tryCatch(() => updateStatement.run(watcher.newNotificationPriority, watcher.notifyWhen, watcher.notifyWhenValue, watcher.uuid, uuid));
    if (error) return res.sendStatus(500);
  }

  res.sendStatus(200);
});

/** Verifies a user exists and returns their data */
router.post("/watchers/create", async (req, res) => {
  const validTerms = Cookie.getMostRecentTerms();
  if (!validTerms) return res.sendStatus(500);

  const { data, error: parseError } = z
    .object({
      uuid: z.string(),
      watchers: z.array(
        z.object({
          term: z.string(),
          crn: z.string(),
          priority: z.number().int().min(0).max(1),
          notifyWhen: z.number().int().min(0).max(3),
          notifyWhenValue: z.number().int()
        })
      )
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const { uuid, watchers } = data;

  const [user, error] = tryCatch<{ uuid: string; num_watchers: number }>(() => db.prepare("SELECT uuid, num_watchers FROM users WHERE uuid = ?").get(uuid) as any);
  if (error) return res.sendStatus(500);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.num_watchers + watchers.length > WATCHER_LIMIT) return res.status(400).json({ error: "Watcher limit exceeded" });

  // TODO: fetch the class and make sure theres a waitlist if waitlist is the notification type

  for (const watcher of watchers) {
    const [existingWatcher, error] = tryCatch<{ uuid: string }>(
      () => db.prepare("SELECT uuid FROM watchers WHERE owner_uuid = ? AND term_id = ? AND crn = ?").get(uuid, watcher.term, watcher.crn) as any
    );
    if (error) return res.sendStatus(500);
    if (existingWatcher) return res.status(418).json({ error: `Watcher already exists for term ${watcher.term} and CRN ${watcher.crn}` });
  }

  const [, error3] = tryCatch(() =>
    db
      .prepare(`INSERT INTO watchers (uuid, owner_uuid, term_id, crn, notification_priority, notify_when, notify_when_value) VALUES ${watchers.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}`)
      .run(...watchers.flatMap((watcher) => [uuidv7(), uuid, watcher.term, watcher.crn, watcher.priority, watcher.notifyWhen, watcher.notifyWhenValue]))
  );
  if (error3) return res.sendStatus(500);

  const [, error4] = tryCatch(() => db.prepare("UPDATE users SET num_watchers = num_watchers + ? WHERE uuid = ?").run(watchers.length, uuid));
  if (error4) return res.sendStatus(500);

  res.sendStatus(200);
});

export default router;
