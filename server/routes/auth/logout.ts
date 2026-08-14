import { authController } from "../../controllers/auth";
import { Router } from "express";
import ENV from "../../../env";
import axios from "axios";

const router = Router();

router.get("/", authController, async (req, res) => {
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
