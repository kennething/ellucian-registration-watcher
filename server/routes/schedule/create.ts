import { authController } from "../../controllers/auth";
import { Cookie } from "../../utils/cookie";
import { tryCatch } from "../../utils/fetch";
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

  const { data: schedule, error: parseError } = z
    .object({
      term: z.string()
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [{ num_schedules }, watcherLimitError] = tryCatch<{ num_schedules: number }>(
    () => db.prepare("SELECT COUNT(*) as num_schedules FROM schedules WHERE owner_uuid = ? LIMIT ?").get(req.user.uuid, ENV.USER_SCHEDULE_LIMIT) as any
  );
  if (watcherLimitError) return res.sendStatus(500);

  if (num_schedules + 1 > ENV.USER_SCHEDULE_LIMIT) return res.status(400).json({ error: "Schedule limit exceeded" });

  db.transaction(() => {
    const scheduleUuid = uuidv7();
    const [, insertError] = tryCatch(() =>
      db
        .prepare(`INSERT INTO schedules (uuid, owner_uuid, created_at, term_id, name, crns) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(scheduleUuid, req.user.uuid, timeNow(), schedule.term, `Schedule ${num_schedules + 1}`, "[]")
    );
    if (insertError) return res.sendStatus(500);

    res.status(200).json({
      uuid: scheduleUuid,
      ownerUuid: req.user.uuid,
      termId: schedule.term,
      name: `Schedule ${num_schedules + 1}`,
      crns: []
    });
  })();
});

export default router;
