import { searchClasses, tryCatch } from "../utils/fetch";
import { authController } from "../controllers/auth";
import { db } from "../utils/sqlite";
import { Router } from "express";
import * as z from "zod";
import { toCamelCase } from "../utils/functions";

const router = Router();

const Schema = z
  .object({
    term: z.string(),
    crn: z.string(),
    subject: z.array(z.string()), // "CS" - subject codes
    courseNumber: z.string(), // "220"
    courseTitle: z.string(),
    meetingDays: z.array(z.boolean()).length(7), // bool for each day of the week, starting on sunday; sunday+monday = [true, true, ...false]
    time: z.tuple([z.number().int().min(0).max(1439), z.number().int().min(0).max(1439)]), // [start: number, end: number]; convert to minutes from midnight
    attribute: z.array(z.string()), // attribute codes
    professor: z.array(z.string()), // instructor codes
    creditHours: z.tuple([z.number().int().min(1).max(99), z.number().int().min(1).max(99)]), // [low: number, high: number]; 1-idk
    openSections: z.boolean(),
    waitlistOpen: z.boolean(),
    professorRating: z.tuple([z.number().int().min(0).max(5), z.number().int().min(0).max(5)]) // [low: number, high: number]; 0-5
  })
  .partial()
  .required({ term: true });
export type ClassSearchParams = z.infer<typeof Schema>;

router.post("/class/search", authController, async (req, res) => {
  const { data, error } = Schema.safeParse(req.body);
  if (error) return res.status(400).json({ error: "Invalid body" });

  const results = await searchClasses(data.term, data);

  return res.status(200).json(results);
});

// router.get("/class/history/:term/:crn", authController, (req, res) => {
//   const { term, crn } = req.params;
//   if (!term || !crn) return res.status(400).json({ error: "Missing term or crn" });

//   const [history, error] = tryCatch<{
//     seat_24h: string;
//     seat_24h_time: number;
//     seat_28d: string;
//     seat_28d_time: number;
//     wait_24h: string | null;
//     wait_24h_time: number | null;
//     wait_28d: string | null;
//     wait_28d_time: number | null;
//   }>(() => db.prepare("SELECT * FROM course_history WHERE term_id = ? AND crn = ?").all(term, crn) as any);
//   if (error) return res.sendStatus(500);

//   return res.status(200).json({
//     lastUpdated: Math.max(history.seat_24h_time, history.seat_28d_time, history.wait_24h_time ?? 0, history.wait_28d_time ?? 0),
//     seat24h: JSON.parse(history.seat_24h),
//     seat28d: JSON.parse(history.seat_28d),
//     wait24h: history.wait_24h ? JSON.parse(history.wait_24h) : null,
//     wait28d: history.wait_28d ? JSON.parse(history.wait_28d) : null
//   });
// });

export default router;
