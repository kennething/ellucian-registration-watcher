import { authController } from "../../controllers/auth";
import { tryCatch } from "~/utils/fetch";
import { timeNow } from "~/utils/time";
import { v7 as uuidv7 } from "uuid";
import { Log } from "~/utils/log";
import { Router } from "express";
import ENV from "~/utils/env";
import { db } from "~/db";
import * as z from "zod";

const router = Router();

router.post("/", authController, async (req, res) => {
  const { data: schedule, error: parseError } = z
    .object({
      term: z.string().max(10),
      name: z.string().min(1).max(100).optional()
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [{ num_schedules }, watcherLimitError] = tryCatch<{ num_schedules: number }>(
    () => db.prepare("SELECT COUNT(*) as num_schedules FROM schedules WHERE owner_uuid = ? LIMIT ?").get(req.user.uuid, ENV.USER_SCHEDULE_LIMIT) as any
  );
  if (watcherLimitError) return res.sendStatus(500);

  if (num_schedules + 1 > ENV.USER_SCHEDULE_LIMIT) return res.status(400).json({ error: "Schedule limit exceeded" });

  try {
    db.transaction(() => {
      const scheduleUuid = uuidv7();
      db.prepare(`INSERT INTO schedules (uuid, owner_uuid, created_at, updated_at, term_id, name) VALUES (?, ?, ?, ?, ?, ?)`).run(
        scheduleUuid,
        req.user.uuid,
        timeNow(),
        timeNow(),
        schedule.term,
        schedule.name ?? `Schedule ${num_schedules + 1}`
      );

      res.status(200).json({
        uuid: scheduleUuid,
        ownerUuid: req.user.uuid,
        termId: schedule.term,
        name: schedule.name ?? `Schedule ${num_schedules + 1}`,
        crns: []
      });
    })();
  } catch (error) {
    Log.error(error);
    res.sendStatus(500);
  }
});

export default router;
