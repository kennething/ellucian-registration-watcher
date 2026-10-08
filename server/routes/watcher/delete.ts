import { authController } from "../../controllers/auth";
import { tryCatch } from "../../utils/fetch";
import { db } from "../../utils/sqlite";
import { Router } from "express";
import * as z from "zod";

const router = Router();

router.delete("/", authController, async (req, res) => {
  const { data: watcher, error: parseError } = z
    .object({
      uuid: z.uuidv7()
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [, deleteFromScheduleError] = tryCatch(() => db.prepare("DELETE FROM schedule_crns WHERE crn = (SELECT crn FROM watchers WHERE uuid = ? AND owner_uuid = ?)").run(watcher.uuid, req.user.uuid));
  if (deleteFromScheduleError) return res.sendStatus(500);

  const [, deleteError] = tryCatch(() => db.prepare(`DELETE FROM watchers WHERE uuid = ? AND owner_uuid = ?`).run(watcher.uuid, req.user.uuid));
  if (deleteError) return res.sendStatus(500);

  res.sendStatus(200);
});

export default router;
