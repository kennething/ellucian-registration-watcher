import { CLIENT } from "../../bot/src/common";
import { tryCatch } from "../utils/fetch";
import { db } from "../utils/sqlite";
import { v6 as uuidv6 } from "uuid";
import { Router } from "express";
import jwt from "jsonwebtoken";
import axios from "axios";

const router = Router();

router.get("/auth/discord", async (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID as string,
    redirect_uri: `${process.env.BACKEND_URL}/auth/discord/callback`,
    response_type: "code",
    scope: "identify email"
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

router.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.status(400).json({ error: "Missing code" });

  try {
    const token = (
      await axios.post(
        "https://discord.com/api/oauth2/token",
        new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID as string,
          client_secret: process.env.DISCORD_CLIENT_SECRET as string,
          grant_type: "authorization_code",
          code,
          redirect_uri: `${process.env.BACKEND_URL}/auth/discord/callback`
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      )
    ).data!.access_token;

    const discordId = (await axios.get("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${token}` } })).data!.id;

    const [result, error] = tryCatch<{ uuid: string }>(() => db.prepare("SELECT uuid FROM users WHERE discord_id = ?").get(discordId) as any);
    if (error) return res.sendStatus(500);

    const uuid = result ? result.uuid : uuidv6();
    if (!result) db.prepare("INSERT INTO users (uuid, discord_id) VALUES (?, ?)").run(uuid, discordId);

    const jwtToken = jwt.sign({ uuid, discordId }, process.env.JWT_SECRET as string, { expiresIn: "7d" });
    res.cookie("token", jwtToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "none" : "lax" });

    const existingUser = await CLIENT.client?.users.fetch(discordId);
    res.redirect(existingUser ? `${process.env.FRONTEND_URL}/watch` : `${process.env.FRONTEND_URL}/setup?sixseven=67`);
  } catch (error) {
    res.sendStatus(500);
  }
});

export default router;
