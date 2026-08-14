import { authController } from "../../controllers/auth";
import { tryCatch } from "../../utils/fetch";
import { db } from "../../utils/sqlite";
import { Router } from "express";

const router = Router();

router.get("/:term/:crn", authController, (req, res) => {
  const { term, crn } = req.params;
  if (!term || !crn) return res.status(400).json({ error: "Missing term or crn" });

  const [history, error] = tryCatch<{
    "24h_timestamp": number;
    "28d_timestamp": number;
    seat_24h: string;
    seat_28d: string;
    wait_24h: string | null;
    wait_28d: string | null;
  }>(() => db.prepare('SELECT "24h_timestamp", "28d_timestamp", seat_24h, seat_28d, wait_24h, wait_28d FROM course_history WHERE term_id = ? AND crn = ?').get(term, crn) as any);
  if (error) return res.sendStatus(500);

  return res.status(200).json({
    lastUpdated: history?.["24h_timestamp"] ?? null,
    seat24h: history ? JSON.parse(history.seat_24h) : null,
    seat28d: history ? JSON.parse(history.seat_28d) : null,
    wait24h: history?.wait_24h ? JSON.parse(history.wait_24h) : null,
    wait28d: history?.wait_28d ? JSON.parse(history.wait_28d) : null
  });
});

export default router;
