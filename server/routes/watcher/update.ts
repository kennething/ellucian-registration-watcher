import { authController } from "../../controllers/auth";
import { tryCatch } from "../../utils/fetch";
import { db } from "../../utils/sqlite";
import { Router } from "express";
import * as z from "zod";

const router = Router();

router.patch("/", authController, async (req, res) => {
  const { data: watcher, error: parseError } = z
    .object({
      uuid: z.string().length(36),
      notifyWhen: z.number().int().min(0).max(3),
      notifyWhenValue: z.number().int()
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [, error2] = tryCatch(() =>
    db.prepare(`UPDATE watchers SET notify_when = ?, notify_when_value = ? WHERE uuid = ? AND owner_uuid = ?`).run(watcher.notifyWhen, watcher.notifyWhenValue, watcher.uuid, req.user.uuid)
  );
  if (error2) return res.sendStatus(500);

  res.sendStatus(200);
});

export default router;
