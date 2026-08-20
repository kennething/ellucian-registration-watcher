import { requestSearchClasses, tryCatch } from "../../utils/fetch";
import { truncateClassData } from "../../utils/functions";
import { authController } from "../../controllers/auth";
import { timeNow } from "../../utils/time";
import { db } from "../../utils/sqlite";
import { v7 as uuidv7 } from "uuid";
import { Router } from "express";
import ENV from "../../../env";
import * as z from "zod";

const router = Router();

router.post("/", authController, async (req, res) => {
  const { data: schedule, error: parseError } = z
    .object({
      uuid: z.string().length(36),
      crns: z.array(z.string()).min(1).max(ENV.USER_WATCHER_LIMIT)
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const uniqueCrns = Array.from(new Set(schedule.crns));

  const duplicateCrns = db.prepare(`SELECT crn FROM watchers WHERE owner_uuid = ? AND crn IN (${uniqueCrns.map(() => "?").join(",")})`).all(req.user.uuid, ...uniqueCrns) as { crn: string }[];
  const missingCrns = uniqueCrns.filter((crn) => !duplicateCrns.some((d) => d.crn === crn));

  const totalWatchers = db.prepare(`SELECT COUNT(*) as num_watchers FROM watchers WHERE owner_uuid = ?`).get(req.user.uuid) as { num_watchers: number };
  if (totalWatchers.num_watchers + missingCrns.length > ENV.USER_WATCHER_LIMIT) return res.status(400).json({ error: "Watcher limit exceeded" });

  const [scheduleTerm, error] = tryCatch<{ term_id: string }>(() => db.prepare("SELECT term_id FROM schedules WHERE uuid = ?").get(schedule.uuid) as any);
  if (error) return res.status(400).json({ error: "Schedule not found" });

  const classes = truncateClassData((await requestSearchClasses(scheduleTerm.term_id, { crn: uniqueCrns.join(" OR ") }))[0]);
  const classesArray = Array.from(classes.values());
  if (classesArray.length === 0) return res.status(400).json({ error: "No classes found for the provided CRNs" });

  const watchers = classesArray
    .filter((c) => missingCrns.includes(c.courseReferenceNumber))
    .map((c) => ({
      uuid: uuidv7(),
      ownerUuid: req.user.uuid,
      termId: scheduleTerm.term_id,
      crn: c.courseReferenceNumber,
      notifyWhen: 1,
      notifyWhenValue: 1,
      isActive: false
    }));
  db.transaction(() => {
    for (const watcher of watchers) {
      db.prepare("INSERT INTO watchers (uuid, owner_uuid, is_active, created_at, term_id, crn, notify_when, notify_when_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        watcher.uuid,
        req.user.uuid,
        Number(watcher.isActive),
        timeNow(),
        watcher.termId,
        watcher.crn,
        watcher.notifyWhen,
        watcher.notifyWhenValue
      );
    }
  })();

  db.prepare(`UPDATE schedules SET crns = ? WHERE uuid = ? AND owner_uuid = ?`).run(JSON.stringify(uniqueCrns), schedule.uuid, req.user.uuid);

  res.status(200).json(
    watchers.map((watcher) => ({
      ...watcher,
      isActive: Boolean(watcher.isActive),
      ...classesArray.find((c) => c.courseReferenceNumber === watcher.crn)
    }))
  );
});

export default router;
