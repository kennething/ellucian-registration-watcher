import { authController } from "../controllers/auth";
import { CLIENT } from "../../bot/src/common";
import { tryCatch } from "../utils/fetch";
import { timeNow } from "../utils/time";
import { db } from "../utils/sqlite";
import { v6 as uuidv6 } from "uuid";
import { Router } from "express";
import jwt from "jsonwebtoken";
import ENV from "../../env";
import axios from "axios";

if (!ENV.FRONTEND_URL) {
  console.error("FRONTEND_URL is not set in the environment variables.");
  process.exit(1);
}

const router = Router();

/** /auth/discord?redirect= */
router.get("/auth/discord", async (req, res) => {
  if (!ENV.DISCORD_CLIENT_ID) {
    console.error("DISCORD_CLIENT_ID is not set in the environment variables.");
    return res.redirect(`${ENV.FRONTEND_URL}/setup`);
  }

  const redirect = req.query.redirect;
  const state = redirect ? Buffer.from(String(redirect)).toString("base64") : undefined;

  const params = new URLSearchParams({
    client_id: ENV.DISCORD_CLIENT_ID,
    redirect_uri: `${ENV.BACKEND_URL}/auth/discord/callback`,
    response_type: "code",
    scope: "identify applications.commands",
    integration_type: "1",
    prompt: "none"
  });
  if (state) params.append("state", state);

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

/** /auth/discord/callback?code=&state= */
router.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.redirect(`${ENV.FRONTEND_URL}/setup`);

  const state = req.query.state as string | undefined;

  if (!ENV.DISCORD_CLIENT_ID || !ENV.DISCORD_CLIENT_SECRET || !ENV.JWT_SECRET) {
    console.error("DISCORD_CLIENT_ID is not set in the environment variables.");
    return res.redirect(`${ENV.FRONTEND_URL}/setup`);
  }

  const redirect = req.query.redirect;

  try {
    const token = (
      await axios.post(
        "https://discord.com/api/oauth2/token",
        new URLSearchParams({
          client_id: ENV.DISCORD_CLIENT_ID,
          client_secret: ENV.DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: `${ENV.BACKEND_URL}/auth/discord/callback`
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      )
    ).data!.access_token;

    const discordId = (await axios.get("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${token}` } })).data!.id;

    const [existingUser, error] = tryCatch<{ uuid: string }>(() => db.prepare("SELECT uuid FROM users WHERE discord_id = ?").get(discordId) as any);
    if (error) return res.sendStatus(500);

    const uuid = existingUser ? existingUser.uuid : uuidv6();
    if (!existingUser) db.prepare("INSERT INTO users (uuid, discord_id, created_at) VALUES (?, ?, ?)").run(uuid, discordId, timeNow());

    const jwtToken = jwt.sign({ uuid, discordId }, ENV.JWT_SECRET as string, { expiresIn: "7d" });
    res.cookie("token", jwtToken, { httpOnly: true, secure: ENV.NODE_ENV === "production", sameSite: ENV.NODE_ENV === "production" ? "none" : "lax" });

    const redirectPath = state ? Buffer.from(state, "base64").toString("utf-8") : "/schedule";
    res.redirect(`${ENV.FRONTEND_URL}${redirectPath}`);

    if (!existingUser) {
      const user = await CLIENT.client?.users.fetch(discordId);
      user?.send(
        `## Thanks for using [Bad Scheduler](<${ENV.FRONTEND_URL}>) :)\nTo get the most out of the bot, make sure you:\n\n1. **Allow Discord notifications** in your system settings,\n2. **DON'T mute** this DM channel, and\n3. **DON'T set __Do Not Disturb__** as your Discord status\\*\n\n-# \\*If you have __Do Not Disturb__ enabled, you will not receive Discord push notifications while:\n-# a. Discord is open on another device, and/or\n-# b. for a few minutes after opening Discord on any device`
      );
    }
  } catch (error) {
    res.sendStatus(500);
  }
});

router.get("/auth/logout", authController, async (req, res) => {
  try {
    await axios.post(
      "https://discord.com/api/oauth2/token/revoke",
      new URLSearchParams({
        token: req.cookies.token,
        token_type_hint: "access_token",
        client_id: ENV.DISCORD_CLIENT_ID as string,
        client_secret: ENV.DISCORD_CLIENT_SECRET as string
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    res.clearCookie("token", { httpOnly: true, secure: ENV.NODE_ENV === "production", sameSite: ENV.NODE_ENV === "production" ? "none" : "lax" });
    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(500);
  }
});

export default router;
