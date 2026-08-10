import { authController } from "../controllers/auth";
import { ClassData } from "../utils/types";
import { tryCatch } from "../utils/fetch";
import { Cookie } from "../utils/cookie";
import { db } from "../utils/sqlite";
import { v7 as uuidv7 } from "uuid";
import { Router } from "express";
import ENV from "../../env";
import * as z from "zod";

const router = Router();

router.delete("/watcher/delete", authController, async (req, res) => {
  const { data: watcher, error: parseError } = z
    .object({
      uuid: z.string().length(36)
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [fetchedWatcher, watcherError] = tryCatch<{ term_id: string; crn: string }>(
    () => db.prepare("SELECT term_id, crn FROM watchers WHERE uuid = ? AND owner_uuid = ?").get(watcher.uuid, req.user.uuid) as any
  );
  if (watcherError) return res.sendStatus(500);

  const [schedules, scheduleError] = tryCatch<{ term_id: string; crns: string }[]>(() => db.prepare("SELECT term_id, crns FROM schedules WHERE owner_uuid = ?").all(req.user.uuid) as any);
  if (scheduleError) return res.sendStatus(500);

  db.transaction(() => {
    for (const schedule of schedules) {
      if (schedule.term_id !== fetchedWatcher.term_id) continue;
      const crns = JSON.parse(schedule.crns) as string[];

      if (crns.includes(fetchedWatcher.crn)) {
        const updatedCrns = crns.filter((crn) => crn !== fetchedWatcher.crn);
        const [, updateError] = tryCatch(() => db.prepare(`UPDATE schedules SET crns = ? WHERE term_id = ? AND owner_uuid = ?`).run(JSON.stringify(updatedCrns), schedule.term_id, req.user.uuid));
        if (updateError) return res.sendStatus(500);
      }
    }
  })();

  const [, deleteError] = tryCatch(() => db.prepare(`DELETE FROM watchers WHERE uuid = ? AND owner_uuid = ?`).run(watcher.uuid, req.user.uuid));
  if (deleteError) return res.sendStatus(500);

  res.sendStatus(200);
});

router.patch("/watcher/update", authController, async (req, res) => {
  const { data: watcher, error: parseError } = z
    .object({
      uuid: z.string().length(36),
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

  const [{ num_watchers }, watcherLimitError] = tryCatch<{ num_watchers: number }>(() => db.prepare("SELECT COUNT(*) as num_watchers FROM watchers WHERE owner_uuid = ?").get(req.user.uuid) as any);
  if (watcherLimitError) return res.sendStatus(500);

  if (num_watchers + 1 > ENV.USER_WATCHER_LIMIT) return res.status(400).json({ error: "Watcher limit exceeded" });

  const course = (await Cookie.requestClient.get<ClassData>(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/searchResults/searchResults?txt_term=${watcher.term}&txt_keywordany=${watcher.crn}`))
    .data;
  if (course.waitCapacity === 0 && watcher.notifyWhen >= 2) return res.status(400).json({ error: "Cannot create watcher for a class with no waitlist" });

  const [existingWatcher, existingWatcherError] = tryCatch<{ uuid: string }>(
    () => db.prepare("SELECT uuid FROM watchers WHERE owner_uuid = ? AND term_id = ? AND crn = ?").get(req.user.uuid, watcher.term, watcher.crn) as any
  );
  if (existingWatcherError) return res.sendStatus(500);
  if (existingWatcher) return res.status(418).json({ error: `Watcher already exists for term ${watcher.term} and CRN ${watcher.crn}` });

  db.transaction(() => {
    const watcherUuid = uuidv7();
    const [, insertError] = tryCatch(() =>
      db
        .prepare(`INSERT INTO watchers (uuid, owner_uuid, term_id, crn, notify_when, notify_when_value) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(watcherUuid, req.user.uuid, watcher.term, watcher.crn, watcher.notifyWhen, watcher.notifyWhenValue)
    );
    if (insertError) return res.sendStatus(500);

    res.status(200).json({
      uuid: watcherUuid,
      ownerUuid: req.user.uuid,
      termId: watcher.term,
      crn: watcher.crn,
      notifyWhen: watcher.notifyWhen,
      notifyWhenValue: watcher.notifyWhenValue
    });
  })();
});

export default router;
