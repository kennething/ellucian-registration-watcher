import { tryCatch } from "../utils/fetch";
import { db } from "../utils/sqlite";
import { v6 as uuidv6 } from "uuid";
import { Router } from "express";

const router = Router();

const WATCHER_LIMIT = 420 as const;

router.delete("/watchers/delete", async (req, res) => {
  const { uuid, watcherUuids } = req.body as { uuid: string; watcherUuids: string[] };
  if (!uuid || typeof uuid !== "string" || !watcherUuids || !Array.isArray(watcherUuids) || watcherUuids.some((wUuid) => typeof wUuid !== "string"))
    return res.status(400).json({ error: "Invalid body" });

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
  const { uuid, watchers } = req.body as { uuid: string; watchers: { uuid: string; newNotificationPriority: number }[] };
  if (
    !uuid ||
    typeof uuid !== "string" ||
    !watchers ||
    !Array.isArray(watchers) ||
    watchers.some((watcher) => typeof watcher.uuid !== "string" || typeof watcher.newNotificationPriority !== "number" || ![0, 1].includes(watcher.newNotificationPriority))
  )
    return res.status(400).json({ error: "Invalid body" });

  const [user, error] = tryCatch<{ uuid: string }>(() => db.prepare("SELECT uuid FROM users WHERE uuid = ?").get(uuid) as any);
  if (error) return res.sendStatus(500);
  if (!user) return res.status(404).json({ error: "User not found" });

  const updateStatement = db.prepare(`UPDATE watchers SET notifcation_priority = ? WHERE uuid = ? AND owner_uuid = ?`);

  for (const watcher of watchers) {
    const [, error] = tryCatch(() => updateStatement.run(watcher.newNotificationPriority, watcher.uuid, uuid));
    if (error) return res.sendStatus(500);
  }

  res.sendStatus(200);
});

/** Verifies a user exists and returns their data */
router.post("/watchers/create", async (req, res) => {
  const { uuid, watchers } = req.body as { uuid: string; watchers: { term: string; crn: string; priority: number }[] };
  if (
    !uuid ||
    typeof uuid !== "string" ||
    !watchers ||
    !Array.isArray(watchers) ||
    watchers.some(
      (watcher) => typeof watcher.term !== "string" || watcher.term.length !== 6 || typeof watcher.crn !== "string" || typeof watcher.priority !== "number" || ![0, 1].includes(watcher.priority)
    )
  )
    return res.status(400).json({ error: "Invalid body" });

  const [user, error] = tryCatch<{ uuid: string; num_watchers: number }>(() => db.prepare("SELECT uuid, num_watchers FROM users WHERE uuid = ?").get(uuid) as any);
  if (error) return res.sendStatus(500);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.num_watchers + watchers.length > WATCHER_LIMIT) return res.status(400).json({ error: "Watcher limit exceeded" });

  const [, error3] = tryCatch(() =>
    db
      .prepare(`INSERT INTO watchers (uuid, owner_uuid, term_id, crn, notifcation_priority) VALUES ${watchers.map(() => "(?, ?, ?, ?, ?)").join(", ")}`)
      .run(...watchers.flatMap((watcher) => [uuidv6(), uuid, watcher.term, watcher.crn, watcher.priority]))
  );
  if (error3) return res.sendStatus(500);

  const [, error4] = tryCatch(() => db.prepare("UPDATE users SET num_watchers = num_watchers + ? WHERE uuid = ?").run(watchers.length, uuid));
  if (error4) return res.sendStatus(500);

  res.sendStatus(200);
});

export default router;
