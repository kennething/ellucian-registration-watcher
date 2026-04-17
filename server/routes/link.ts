import { Router } from "express";
import { openDb } from "../utils/sqlite";
import { v6 as uuidv6 } from "uuid";
import { CLIENT } from "../../bot/src/common";
import bcrypt from "bcrypt";
import { Database } from "sqlite";

const router = Router();

router.post("/confirm-link/:code", async (req, res) => {
  const code = req.params.code;
  if (!code || typeof code !== "string") return res.status(400).json({ error: "Invalid route parameters" });

  const db = await openDb();
  const result = await db.get("SELECT discord_id, uuid FROM users WHERE pairing_code = ?", decodeURIComponent(code));
  if (!result) return res.status(404).json({ error: "Invalid or expired pairing code" });

  const { discord_id: discordId, uuid } = result;
  await db.run("UPDATE users SET pairing_code = NULL WHERE uuid = ?", uuid);
  pairingCodeTimers.delete(uuid);

  const user = await CLIENT.client?.users.fetch(discordId);
  if (user) user.send({ content: "Your account has been linked to a new client." });

  res.sendStatus(200);
});

/** Creates a new user. To be called by an application command by the user on discord */
router.post("/link/:discordId", async (req, res) => {
  const discordId = req.params.discordId;
  if (!discordId || discordId.length < 17 || discordId.length > 19 || typeof discordId !== "string" || Number.isNaN(Number(discordId)))
    return res.status(400).json({ error: "Invalid route parameters" });

  const user = await CLIENT.client?.users.fetch(discordId);
  if (!user) return res.status(404).json({ error: "App not installed on user's account" });

  const db = await openDb();
  const result = await db.get("SELECT uuid FROM users WHERE discord_id = ?", discordId);

  const uuid = result ? result.uuid : uuidv6();
  if (!result) await db.run("INSERT INTO users (uuid, discord_id) VALUES (?, ?)", uuid, discordId);
  const code = await generatePairingCode(db, discordId, uuid);

  res.status(200).json({ code });
});

const pairingCodeTimers = new Map<string, symbol>();
async function generatePairingCode(db: Database, discordId: string, uuid: string) {
  const hash = await bcrypt.hash(discordId, 8);

  await db.run("UPDATE users SET pairing_code = ? WHERE uuid = ?", hash, uuid);

  const symbol = Symbol();
  pairingCodeTimers.set(uuid, symbol);
  setTimeout(
    async () => {
      if (pairingCodeTimers.get(uuid) !== symbol) return;
      await db.run("UPDATE users SET pairing_code = NULL WHERE uuid = ?", uuid);
      pairingCodeTimers.delete(uuid);
    },
    5 * 60 * 1000
  );

  return hash;
}

export default router;
