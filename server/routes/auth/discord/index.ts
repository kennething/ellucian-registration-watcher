import ENV from "../../../../env";
import { Router } from "express";

const router = Router();

/** /auth/discord?redirect= */
router.get("/", async (req, res) => {
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

export default router;
