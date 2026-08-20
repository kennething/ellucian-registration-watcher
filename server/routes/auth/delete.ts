import { authController } from "../../controllers/auth";
import { CLIENT } from "../../../bot/src/common";
import { db } from "../../utils/sqlite";
import { Router } from "express";

const router = Router();

router.delete("/", authController, async (req, res) => {
  const user = req.user;

  try {
    res.clearCookie("token");

    db.prepare("DELETE FROM users WHERE uuid = ?").run(user.uuid);

    const discordUser = await CLIENT.client?.users.fetch(user.discordId);
    discordUser?.send(
      `## Sorry to see you go :(\nYour data has now been deleted.\n\n### You can now revoke the Bad Scheduler app's permissions from your Discord account:\n\n1. Go to your user settings\n2. Under *Games & Apps*, go to **Connected Apps**\n3. Deauthorize the Bad Scheduler app`
    );

    res.sendStatus(204);
  } catch (error) {
    res.sendStatus(500);
  }
});

export default router;
