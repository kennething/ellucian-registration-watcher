import { authController } from "../../controllers/auth";
import { tryCatch } from "../../utils/fetch";
import { db } from "../../utils/sqlite";
import { Router } from "express";
import * as z from "zod";

const router = Router();

router.patch("/", authController, async (req, res) => {
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

export default router;
