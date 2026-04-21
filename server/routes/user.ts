import { CLIENT } from "../../bot/src/common";
import { Router } from "express";

const router = Router();

/** Verifies a user exists and returns their data */
router.get("/hi", async (req, res) => {
  CLIENT.client?.users.fetch("487351389240950787").then((user) => user.send({ content: "aaaa", flags: "SuppressNotifications" }));
  res.sendStatus(200);
});

export default router;
