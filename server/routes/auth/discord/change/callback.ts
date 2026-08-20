import { authController } from "../../../../controllers/auth";
import { CLIENT } from "../../../../../bot/src/common";
import { tryCatch } from "../../../../utils/fetch";
import { db } from "../../../../utils/sqlite";
import ENV from "../../../../../env";
import { Router } from "express";
import jwt from "jsonwebtoken";
import axios from "axios";

const router = Router();

router.get("/", authController, async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.redirect(`${ENV.FRONTEND_URL}/settings`);

  if (!ENV.DISCORD_CLIENT_ID || !ENV.DISCORD_CLIENT_SECRET || !ENV.JWT_SECRET) {
    console.error("DISCORD_CLIENT_ID is not set in the environment variables.");
    return res.redirect(`${ENV.FRONTEND_URL}/setup`);
  }

  try {
    const token = (
      await axios.post(
        "https://discord.com/api/oauth2/token",
        new URLSearchParams({
          client_id: ENV.DISCORD_CLIENT_ID,
          client_secret: ENV.DISCORD_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
          redirect_uri: `${ENV.BACKEND_URL}/auth/discord/change/callback`
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      )
    ).data!.access_token;

    const discordId = (await axios.get("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${token}` } })).data!.id;

    const [existingUser, error] = tryCatch<{ discord_id: string }>(() => db.prepare("SELECT discord_id FROM users WHERE uuid = ?").get(req.user.uuid) as any);
    if (!existingUser) return res.redirect(`${ENV.FRONTEND_URL}/setup`);
    if (error) return res.sendStatus(500);

    if (existingUser.discord_id === discordId) return res.redirect(`${ENV.FRONTEND_URL}/settings`);

    db.prepare("UPDATE users SET discord_id = ? WHERE uuid = ?").run(discordId, req.user.uuid);

    const jwtToken = jwt.sign({ uuid: req.user.uuid, discordId }, ENV.JWT_SECRET as string, { expiresIn: "7d" });
    res.clearCookie("token");
    res.cookie("token", jwtToken, {
      httpOnly: true,
      secure: ENV.NODE_ENV === "production",
      sameSite: ENV.NODE_ENV === "production" ? "none" : "lax",
      expires: new Date(Date.now() + 86400 * 7 * 1000)
    });

    res.redirect(`${ENV.FRONTEND_URL}/settings`);

    const oldUser = await CLIENT.client?.users.fetch(existingUser.discord_id);
    oldUser?.send(
      `## Your Bad Scheduler account has been linked to a different Discord account.\n\n### You can now revoke the Bad Scheduler app's permissions from this account:\n\n1. Go to your user settings\n2. Under *Games & Apps*, go to **Connected Apps**\n3. Deauthorize the Bad Scheduler app\n\n-# If you did not initiate this change, womp womp`
    );
    const newUser = await CLIENT.client?.users.fetch(discordId);
    newUser?.send("Your Bad Scheduler account has now been linked to this Discord account.");
  } catch (error) {
    res.sendStatus(500);
  }
});

export default router;
