import { searchClasses } from "../utils/fetch";
import { Router } from "express";
import * as z from "zod";

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

router.post("/class/search", async (req, res) => {
  const { data, error } = Schema.safeParse(req.body);
  if (error) return res.status(400).json({ error: "Invalid body" });

  const results = await searchClasses(data.term, data);

  return res.status(200).json(results);
});

export default router;
