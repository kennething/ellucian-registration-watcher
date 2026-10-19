import { verifyKeyMiddleware } from "discord-interactions";
import { tryCatch } from "~/utils/fetch";
import { Router } from "express";
import ENV from "~/utils/env";
import { db } from "~/db";

type DiscordWebhookPayload = {
  version: number;
  application_id: string;
  type: number;
  event?: {
    type: string;
    timestamp: string;
    data?: {
      user?: {
        id: string;
        username?: string;
      };
    };
  };
};

const router = Router();

router.post("/", verifyKeyMiddleware(ENV.DISCORD_PUBLIC_KEY), async (req, res) => {
  const payload = req.body as DiscordWebhookPayload;

  if (payload.type === 0) return res.status(204).end();
  if (payload.type !== 1 || !payload.event) return res.sendStatus(400);
  if (payload.application_id !== ENV.APPLICATION_ID) return res.sendStatus(400);

  const { event } = payload;

  if (event.type !== "APPLICATION_DEAUTHORIZED") return res.status(204).end();

  const userId = event.data?.user?.id;
  if (!userId) return res.sendStatus(400);

  const [, setError] = tryCatch(() => db.prepare("UPDATE users SET is_installed = 0 WHERE discord_id = ?").run(userId));
  if (setError) return res.sendStatus(500);

  return res.status(204).end();
});

export default router;
