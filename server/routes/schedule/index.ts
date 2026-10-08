import { searchClasses, tryCatch } from "../../utils/fetch";
import { truncateClassData } from "../../utils/functions";
import { botClient } from "../../../bot/src/common";
import { db } from "../../utils/sqlite";
import { Router } from "express";

const router = Router();

router.get("/:uuid", async (req, res) => {
  const { uuid } = req.params;
  if (!uuid || uuid.length !== 36) return res.status(400).json({ error: "Invalid schedule UUID" });

  const [schedule, error] = tryCatch<{ uuid: string; owner_uuid: string; term_id: string; name: string; crns: string } | undefined>(
    () =>
      db
        .prepare(
          `SELECT 
        s.uuid,
        s.owner_uuid,
        s.term_id,
        s.name,
        COALESCE(json_group_array(sc.crn) FILTER (WHERE sc.crn IS NOT NULL), '[]') AS crns
    FROM schedules s
    LEFT JOIN schedule_crns sc ON s.uuid = sc.uuid
    WHERE s.uuid = ?
    GROUP BY s.uuid`
        )
        .get(uuid) as any
  );
  if (error) return res.sendStatus(500);
  if (!schedule) return res.status(404).json({ error: "Schedule not found" });

  const crns = JSON.parse(schedule.crns) as string[];

  const classes = crns.length === 0 ? ([[], 0] as [[], number]) : await searchClasses(schedule.term_id, { crn: crns });
  const truncatedClasses = Array.from(truncateClassData(classes[0]).values());

  const [ownerDiscordId, _error2] = tryCatch<{ discord_id: string }>(() => db.prepare("SELECT discord_id FROM users WHERE uuid = ?").get(schedule.owner_uuid) as any);
  const owner = ownerDiscordId ? await botClient.client?.users.fetch(ownerDiscordId.discord_id) : undefined;

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
