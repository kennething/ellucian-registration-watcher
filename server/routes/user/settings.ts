import { authController } from "../../controllers/auth";
import { tryCatch } from "~/utils/fetch";
import { Router } from "express";
import { db } from "~/db";
import * as z from "zod";

const router = Router();

router.put("/", authController, async (req, res) => {
  const { data: settings, error: parseError } = z
    .object({
      theme: z.number().int().min(0).max(2),
      notifications: z.object({
        newTerms: z.boolean(),
        staleTerms: z.boolean(),
        defaultWatchers: z.boolean()
      })
    })
    .safeParse(req.body);
  if (parseError) return res.status(400).json({ error: "Invalid body" });

  const [, updateError] = tryCatch(() =>
    db
      .prepare("UPDATE user_settings SET web_theme = ?, notify_new_terms = ?, notify_stale_terms = ?, notify_default_watchers = ? WHERE uuid = ?")
      .run(settings.theme, Number(settings.notifications.newTerms), Number(settings.notifications.staleTerms), Number(settings.notifications.defaultWatchers), req.user.uuid)
  );
  if (updateError) return res.sendStatus(500);

  res.sendStatus(200);
});

export default router;
