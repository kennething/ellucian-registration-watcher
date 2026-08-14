import { authController } from "../../controllers/auth";
import { tryCatch } from "../../utils/fetch";
import { db } from "../../utils/sqlite";
import { Router } from "express";
import * as z from "zod";

const router = Router();

router.delete("/", authController, async (req, res) => {
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

export default router;
