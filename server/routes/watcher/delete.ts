import { authController } from "../../controllers/auth";
import { tryCatch } from "../../utils/fetch";
import { db } from "../../utils/sqlite";
import { Router } from "express";
import * as z from "zod";

const router = Router();

router.delete("/", authController, async (req, res) => {
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

export default router;
