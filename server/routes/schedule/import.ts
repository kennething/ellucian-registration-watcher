import { searchClasses, tryCatch } from "~/utils/fetch";
import { authController } from "../../controllers/auth";
import { truncateClassData } from "~/utils/functions";
import { timeNow } from "~/utils/time";
import { v7 as uuidv7 } from "uuid";
import { Router } from "express";
import ENV from "~/utils/env";
import { db } from "~/db";
import * as z from "zod";

const router = Router();

router.post("/", authController, async (req, res) => {
  const { data: schedule, error: parseError } = z
    .object({
      uuid: z.uuidv7(),
      crns: z.array(z.string().max(10)).min(1).max(ENV.USER_WATCHER_LIMIT)
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const uniqueCrns = Array.from(new Set(schedule.crns));

  const duplicateCrns = db.prepare(`SELECT crn FROM watchers WHERE owner_uuid = ? AND crn IN (${uniqueCrns.map(() => "?").join(",")})`).all(req.user.uuid, ...uniqueCrns) as { crn: string }[];
  const missingCrns = uniqueCrns.filter((crn) => !duplicateCrns.some((d) => d.crn === crn));

  const totalWatchers = db.prepare(`SELECT COUNT(*) as num_watchers FROM watchers WHERE owner_uuid = ? LIMIT ?`).get(req.user.uuid, ENV.USER_WATCHER_LIMIT) as { num_watchers: number };
  if (totalWatchers.num_watchers + missingCrns.length > ENV.USER_WATCHER_LIMIT) return res.status(400).json({ error: "Watcher limit exceeded" });

  const [scheduleTerm, error] = tryCatch<{ term_id: string }>(() => db.prepare("SELECT term_id FROM schedules WHERE uuid = ? AND owner_uuid = ?").get(schedule.uuid, req.user.uuid) as any);
  if (error) return res.status(400).json({ error: "Schedule not found" });

  const classes = truncateClassData((await searchClasses(scheduleTerm.term_id, { crn: uniqueCrns }))[0]);
  const classesArray = Array.from(classes.values());
  if (classesArray.length === 0) return res.status(400).json({ error: "No classes found for the provided CRNs" });

  const { notify_default_watchers: defaultNotify } = db.prepare("SELECT notify_default_watchers FROM user_settings WHERE uuid = ?").get(req.user.uuid) as { notify_default_watchers: number };

  const watchers = classesArray.map((c) => ({
    uuid: uuidv7(),
    ownerUuid: req.user.uuid,
    termId: scheduleTerm.term_id,
    crn: c.courseReferenceNumber,
    isActive: defaultNotify,
    notifyWhen: 1,
    notifyWhenValue: 1
  }));
  db.transaction(() => {
    db.prepare("UPDATE schedules SET updated_at = ? WHERE uuid = ? AND owner_uuid = ?").run(timeNow(), schedule.uuid, req.user.uuid);

    const insertWatcher = db.prepare("INSERT INTO watchers (uuid, owner_uuid, is_active, created_at, updated_at, term_id, crn, notify_when, notify_when_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertScheduleCrn = db.prepare("INSERT INTO schedule_crns (uuid, crn) VALUES (?, ?)");

    for (const watcher of watchers) {
      if (missingCrns.includes(watcher.crn))
        insertWatcher.run(watcher.uuid, req.user.uuid, watcher.isActive, timeNow(), timeNow(), watcher.termId, watcher.crn, watcher.notifyWhen, watcher.notifyWhenValue);
      insertScheduleCrn.run(schedule.uuid, watcher.crn);
    }
  })();

  res.status(200).json(
    watchers
      .filter((watcher) => missingCrns.includes(watcher.crn))
      .map((watcher) => ({
        ...watcher,
        isActive: Boolean(watcher.isActive),
        ...classesArray.find((c) => c.courseReferenceNumber === watcher.crn),
        hasData: true
      }))
  );
});

export default router;
