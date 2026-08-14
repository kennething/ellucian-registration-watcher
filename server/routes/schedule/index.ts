import { fetchClasses, tryCatch } from "../../utils/fetch";
import { truncateClassData } from "../../utils/functions";
import { CLIENT } from "../../../bot/src/common";
import { db } from "../../utils/sqlite";
import { Router } from "express";

const router = Router();

router.get("/:uuid", async (req, res) => {
  const { uuid } = req.params;
  if (!uuid || uuid.length !== 36) return res.status(400).json({ error: "Invalid schedule UUID" });

  const [schedule, error] = tryCatch<{ uuid: string; owner_uuid: string; term_id: string; name: string; crns: string } | undefined>(
    () => db.prepare("SELECT uuid, owner_uuid, term_id, name, crns FROM schedules WHERE uuid = ?").get(uuid) as any
  );
  if (error) return res.sendStatus(500);
  if (!schedule) return res.status(404).json({ error: "Schedule not found" });

  const classes = await fetchClasses(schedule.term_id, new Set(JSON.parse(schedule.crns)));
  const truncatedClasses = Array.from(truncateClassData(classes).values());

  const [ownerDiscordId, _error2] = tryCatch<{ discord_id: string }>(() => db.prepare("SELECT discord_id FROM users WHERE uuid = ?").get(schedule.owner_uuid) as any);
  const owner = ownerDiscordId ? await CLIENT.client?.users.fetch(ownerDiscordId.discord_id) : undefined;

  res.status(200).json({
    uuid: schedule.uuid,
    owner: {
      uuid: schedule.owner_uuid,
      discordId: owner?.id,
      displayName: owner?.displayName,
      avatar: owner?.avatar
    },
    termId: schedule.term_id,
    courses: truncatedClasses
  });
});

export default router;
