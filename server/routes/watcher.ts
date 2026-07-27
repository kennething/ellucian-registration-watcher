import { authController } from "../controllers/auth";
import { tryCatch } from "../utils/fetch";
import { Cookie } from "../utils/cookie";
import { db } from "../utils/sqlite";
import { v7 as uuidv7 } from "uuid";
import { Router } from "express";
import * as z from "zod";

const router = Router();

const WATCHER_LIMIT = 67 as const;

router.delete("/watcher/delete", authController, async (req, res) => {
  const { data: watcher, error: parseError } = z
    .object({
      uuid: z.string()
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [, error2] = tryCatch(() => db.prepare(`DELETE FROM watchers WHERE uuid = ? AND owner_uuid = ?`).run(watcher.uuid, req.user.uuid));
  if (error2) return res.sendStatus(500);

  const [, error3] = tryCatch(() => db.prepare("UPDATE users SET num_watchers = num_watchers - 1 WHERE uuid = ?").run(req.user.uuid));
  if (error3) return res.sendStatus(500);

  res.sendStatus(200);
});

router.patch("/watcher/update", authController, async (req, res) => {
  const { data: watcher, error: parseError } = z
    .object({
      uuid: z.string(),
      notifyWhen: z.number().int().min(0).max(3),
      notifyWhenValue: z.number().int()
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [, error2] = tryCatch(() =>
    db.prepare(`UPDATE watchers SET notify_when = ?, notify_when_value = ? WHERE uuid = ? AND owner_uuid = ?`).run(watcher.notifyWhen, watcher.notifyWhenValue, watcher.uuid, req.user.uuid)
  );
  if (error2) return res.sendStatus(500);

  res.sendStatus(200);
});

router.post("/watcher/create", authController, async (req, res) => {
  const validTerms = Cookie.getMostRecentTerms();
  if (!validTerms) return res.sendStatus(500);

  const { data: watcher, error: parseError } = z
    .object({
      term: z.string(),
      crn: z.string(),
      notifyWhen: z.number().int().min(0).max(3),
      notifyWhenValue: z.number().int()
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [{ num_watchers }, error] = tryCatch<{ num_watchers: number }>(() => db.prepare("SELECT num_watchers FROM users WHERE uuid = ?").get(req.user.uuid) as any);
  if (error) return res.sendStatus(500);

  if (num_watchers + 1 > WATCHER_LIMIT) return res.status(400).json({ error: "Watcher limit exceeded" });

  // TODO: fetch the class and make sure theres a waitlist if waitlist is the notification type

  const [existingWatcher, error2] = tryCatch<{ uuid: string }>(
    () => db.prepare("SELECT uuid FROM watchers WHERE owner_uuid = ? AND term_id = ? AND crn = ?").get(req.user.uuid, watcher.term, watcher.crn) as any
  );
  if (error2) return res.sendStatus(500);
  if (existingWatcher) return res.status(418).json({ error: `Watcher already exists for term ${watcher.term} and CRN ${watcher.crn}` });

  const [, error3] = tryCatch(() =>
    db
      .prepare(`INSERT INTO watchers (uuid, owner_uuid, term_id, crn, notify_when, notify_when_value) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(uuidv7(), req.user.uuid, watcher.term, watcher.crn, watcher.notifyWhen, watcher.notifyWhenValue)
  );
  if (error3) return res.sendStatus(500);

  const [, error4] = tryCatch(() => db.prepare("UPDATE users SET num_watchers = num_watchers + 1 WHERE uuid = ?").run(req.user.uuid));
  if (error4) return res.sendStatus(500);

  res.sendStatus(200);
});

export default router;
