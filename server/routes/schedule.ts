import { authController } from "../controllers/auth";
import { tryCatch } from "../utils/fetch";
import { Cookie } from "../utils/cookie";
import { db } from "../utils/sqlite";
import { v7 as uuidv7 } from "uuid";
import { Router } from "express";
import * as z from "zod";

const router = Router();

const SCHEDULE_LIMIT = 5 as const;

router.delete("/schedule/delete", authController, async (req, res) => {
  const { data: schedule, error: parseError } = z
    .object({
      uuid: z.string().length(36)
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [, error2] = tryCatch(() => db.prepare(`DELETE FROM schedules WHERE uuid = ? AND owner_uuid = ?`).run(schedule.uuid, req.user.uuid));
  if (error2) return res.sendStatus(500);

  res.sendStatus(200);
});

router.patch("/schedule/update", authController, async (req, res) => {
  const { data: schedule, error: parseError } = z
    .object({
      uuid: z.string().length(36),
      name: z.string().min(1).max(100),
      crns: z.array(z.string())
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const uniqueCrns = Array.from(new Set(schedule.crns));
  if (uniqueCrns.length !== schedule.crns.length) return res.status(400).json({ error: "Duplicate CRNs in schedule" });

  const [, error2] = tryCatch(() =>
    db.prepare(`UPDATE schedules SET name = ?, crns = ? WHERE uuid = ? AND owner_uuid = ?`).run(schedule.name, JSON.stringify(uniqueCrns), schedule.uuid, req.user.uuid)
  );
  if (error2) return res.sendStatus(500);

  res.sendStatus(200);
});

router.post("/schedule/create", authController, async (req, res) => {
  const validTerms = Cookie.getMostRecentTerms();
  if (!validTerms) return res.sendStatus(500);

  const { data: schedule, error: parseError } = z
    .object({
      term: z.string()
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [{ num_schedules }, watcherLimitError] = tryCatch<{ num_schedules: number }>(
    () => db.prepare("SELECT COUNT(*) as num_schedules FROM schedules WHERE owner_uuid = ?").get(req.user.uuid) as any
  );
  if (watcherLimitError) return res.sendStatus(500);

  if (num_schedules + 1 > SCHEDULE_LIMIT) return res.status(400).json({ error: "Schedule limit exceeded" });

  db.transaction(() => {
    const scheduleUuid = uuidv7();
    const [, insertError] = tryCatch(() =>
      db.prepare(`INSERT INTO schedules (uuid, owner_uuid, term_id, name, crns) VALUES (?, ?, ?, ?, ?)`).run(scheduleUuid, req.user.uuid, schedule.term, `Schedule ${num_schedules + 1}`, "[]")
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
