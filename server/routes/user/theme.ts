import { authController } from "../../controllers/auth";
import { tryCatch } from "../../utils/fetch";
import { db } from "../../utils/sqlite";
import { Router } from "express";
import * as z from "zod";

const router = Router();

router.put("/", authController, async (req, res) => {
  const { data: settings, error: parseError } = z
    .object({
      theme: z.number().int().min(0).max(2)
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [, updateError] = tryCatch(() => db.prepare("UPDATE users SET web_theme = ? WHERE uuid = ?").run(settings.theme, req.user.uuid));
  if (updateError) return res.sendStatus(500);

  res.sendStatus(200);
});

export default router;
