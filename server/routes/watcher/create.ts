import { authController } from "../../controllers/auth";
import { ClassData } from "../../utils/types";
import { tryCatch } from "../../utils/fetch";
import { Cookie } from "../../utils/cookie";
import { timeNow } from "../../utils/time";
import { db } from "../../utils/sqlite";
import { v7 as uuidv7 } from "uuid";
import { Router } from "express";
import ENV from "../../../env";
import * as z from "zod";

const router = Router();

router.post("/", authController, async (req, res) => {
  const validTerms = Cookie.getMostRecentTerms();
  if (!validTerms) return res.sendStatus(500);

  const { data: watcher, error: parseError } = z
    .object({
      term: z.string(),
      crn: z.string(),
      notifyWhen: z.number().int().min(0).max(3),
      notifyWhenValue: z.number().int(),
      isActive: z.boolean()
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [{ num_watchers }, watcherLimitError] = tryCatch<{ num_watchers: number }>(() => db.prepare("SELECT COUNT(*) as num_watchers FROM watchers WHERE owner_uuid = ?").get(req.user.uuid) as any);
  if (watcherLimitError) return res.sendStatus(500);

  if (num_watchers + 1 > ENV.USER_WATCHER_LIMIT) return res.status(400).json({ error: "Watcher limit exceeded" });

  const course = (await Cookie.requestClient.get<ClassData>(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/searchResults/searchResults?txt_term=${watcher.term}&txt_keywordany=${watcher.crn}`))
    .data;
  if (course.waitCapacity === 0 && watcher.notifyWhen >= 2) return res.status(400).json({ error: "Cannot create watcher for a class with no waitlist" });
  if (watcher.notifyWhen < 2 && watcher.notifyWhenValue > course.maximumEnrollment) return res.status(400).json({ error: "Notify when value cannot exceed maximum enrollment" });
  if (watcher.notifyWhen >= 2 && watcher.notifyWhenValue > course.waitCapacity) return res.status(400).json({ error: "Notify when value cannot exceed waitlist capacity" });

  const [existingWatcher, existingWatcherError] = tryCatch<{ uuid: string }>(
    () => db.prepare("SELECT uuid FROM watchers WHERE owner_uuid = ? AND term_id = ? AND crn = ?").get(req.user.uuid, watcher.term, watcher.crn) as any
  );
  if (existingWatcherError) return res.sendStatus(500);
  if (existingWatcher) return res.status(418).json({ error: `Watcher already exists for term ${watcher.term} and CRN ${watcher.crn}` });

  db.transaction(() => {
    const watcherUuid = uuidv7();
    const [, insertError] = tryCatch(() =>
      db
        .prepare(`INSERT INTO watchers (uuid, owner_uuid, is_active, created_at, term_id, crn, notify_when, notify_when_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(watcherUuid, req.user.uuid, Number(watcher.isActive), timeNow(), watcher.term, watcher.crn, watcher.notifyWhen, watcher.notifyWhenValue)
    );
    if (insertError) return res.sendStatus(500);

    res.status(200).json({
      uuid: watcherUuid,
      ownerUuid: req.user.uuid,
      termId: watcher.term,
      crn: watcher.crn,
      notifyWhen: watcher.notifyWhen,
      notifyWhenValue: watcher.notifyWhenValue,
      isActive: watcher.isActive
    });
  })();
});

export default router;
