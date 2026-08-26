import { searchClasses, tryCatch } from "../../utils/fetch";
import { authController } from "../../controllers/auth";
import { db } from "../../utils/sqlite";
import { Router } from "express";
import * as z from "zod";

const router = Router();

router.patch("/", authController, async (req, res) => {
  const { data: watcher, error: parseError } = z
    .object({
      uuid: z.string().length(36),
      notifyWhen: z.number().int().min(0).max(3),
      notifyWhenValue: z.number().int(),
      isActive: z.boolean()
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [existingWatcher, existingWatcherError] = tryCatch<{ term_id: string; crn: string }>(
    () => db.prepare("SELECT term_id, crn FROM watchers WHERE uuid = ? AND owner_uuid = ?").get(watcher.uuid, req.user.uuid) as any
  );
  if (existingWatcherError) return res.sendStatus(500);
  if (!existingWatcher) return res.status(404).json({ error: "Watcher not found" });

  const course = (await searchClasses(existingWatcher.term_id, { crn: [existingWatcher.crn] }, 0, 1))[0][0];
  if (!course) return res.status(400).json({ error: "Course not found" });
  if (course.waitCapacity === 0 && watcher.notifyWhen >= 2) return res.status(400).json({ error: "Cannot create watcher for a class with no waitlist" });
  if (watcher.notifyWhen < 2 && watcher.notifyWhenValue > course.maximumEnrollment) return res.status(400).json({ error: "Notify when value cannot exceed maximum enrollment" });
  if (watcher.notifyWhen >= 2 && watcher.notifyWhenValue > course.waitCapacity) return res.status(400).json({ error: "Notify when value cannot exceed waitlist capacity" });

  const [, error2] = tryCatch(() =>
    db
      .prepare(`UPDATE watchers SET is_active = ?, notify_when = ?, notify_when_value = ? WHERE uuid = ? AND owner_uuid = ?`)
      .run(Number(watcher.isActive), watcher.notifyWhen, watcher.notifyWhenValue, watcher.uuid, req.user.uuid)
  );
  if (error2) return res.sendStatus(500);

  res.sendStatus(200);
});

export default router;
