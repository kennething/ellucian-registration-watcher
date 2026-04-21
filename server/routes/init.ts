import { tryCatch } from "../utils/fetch";
import { db } from "../utils/sqlite";
import { Router } from "express";

const router = Router();

router.get("/init", async (req, res) => {
  const uuid: string = req.body.uuid;
  if (!uuid || typeof uuid !== "string") return res.sendStatus(404);

  const [watchers, error] = tryCatch<{ uuid: string; owner_uuid: string; term_id: string; crn_list: string; delete_warning_date: number }[]>(
    () => db.prepare("SELECT * FROM watchers WHERE owner_uuid = ?").all(uuid) as any
  );
  if (error) return res.sendStatus(500);

  res.status(200).json(watchers.map((watcher) => ({ ...watcher, crn_list: JSON.parse(watcher.crn_list) })));
});

export default router;
