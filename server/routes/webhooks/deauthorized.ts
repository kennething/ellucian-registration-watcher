import { rawJsonController } from "~/server/controllers/rawJson";
import { tryCatch } from "~/utils/fetch";
import { Router } from "express";
import ENV from "~/utils/env";
import nacl from "tweetnacl";
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

router.post("/", rawJsonController, async (req, res) => {
  const publicKey = Buffer.from(ENV.DISCORD_PUBLIC_KEY, "hex");

  const signature = req.get("X-Signature-Ed25519");
  const timestamp = req.get("X-Signature-Timestamp");
  if (!signature || !/^[0-9a-fA-F]{128}$/.test(signature) || !timestamp || !/^\d+$/.test(timestamp) || !Buffer.isBuffer(req.body)) return res.sendStatus(401);

  const rawBody = req.body as Buffer;
  const [isValid, error] = tryCatch(() => nacl.sign.detached.verify(Buffer.concat([Buffer.from(timestamp, "utf8"), rawBody]), Buffer.from(signature, "hex"), publicKey));
  if (!isValid || error) return res.sendStatus(401);

  const [payload, parseError] = tryCatch(() => JSON.parse(rawBody.toString("utf8")) as DiscordWebhookPayload);
  if (parseError) return res.sendStatus(400);

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
