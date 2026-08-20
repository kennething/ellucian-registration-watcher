import { authController } from "../../../../controllers/auth";
import ENV from "../../../../../env";
import { Router } from "express";

const router = Router();

router.get("/", authController, async (req, res) => {
  if (!ENV.DISCORD_CLIENT_ID) {
    console.error("DISCORD_CLIENT_ID is not set in the environment variables.");
    return res.redirect(`${ENV.FRONTEND_URL}/setup`);
  }

  const params = new URLSearchParams({
    client_id: ENV.DISCORD_CLIENT_ID,
    redirect_uri: `${ENV.BACKEND_URL}/auth/discord/change/callback`,
    response_type: "code",
    scope: "identify applications.commands",
    integration_type: "1",
    prompt: "consent"
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

export default router;
