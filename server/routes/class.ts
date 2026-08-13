import { fetchClassDescription, requestSearchClasses, tryCatch } from "../utils/fetch";
import { authController } from "../controllers/auth";
import { TruncatedClassData } from "../utils/types";
import { db } from "../utils/sqlite";
import { Router } from "express";
import * as z from "zod";

const router = Router();

const Schema = z
  .object({
    term: z.string(),
    crn: z.string(),
    subject: z.string(), // "CS" - subject code
    // too much work // // subject: z.array(z.string()), // "CS" - subject codes
    courseNumber: z.string(), // "220"
    courseTitle: z.string(),
    meetingDays: z.array(z.boolean()).length(7), // bool for each day of the week, starting on sunday; sunday+monday = [true, true, ...false]
    time: z.tuple([
      z.number().int().min(1).max(12).nullable(),
      z.number().int().min(0).max(59).nullable(),
      z.enum(["AM", "PM"]),
      z.number().int().min(1).max(12).nullable(),
      z.number().int().min(0).max(59).nullable(),
      z.enum(["AM", "PM"])
    ]), // [startHour: number, startMinute: number, startAmpm: "AM" | "PM", endHour: number, endMinute: number, endAmpm: "AM" | "PM"]
    attribute: z.string(), // attribute code
    // too much work // // attribute: z.array(z.string()), // attribute codes
    // too much work // // professor: z.array(z.string()), // instructor codes
    creditHours: z.tuple([z.number().int().min(0).max(4), z.number().int().min(0).max(4)]), // [low: number, high: number]; 1-4
    // too much work // // openSections: z.boolean(),
    // too much work // // waitlistOpen: z.boolean(),
    professorRating: z.tuple([z.number().min(0).max(5), z.number().min(0).max(5)]) // [low: number, high: number]; 0-5
  })
  .partial()
  .required({ term: true });
export type ClassSearchParams = z.infer<typeof Schema>;

/** /class/search?filters=&offset=&limit= */
router.get("/class/search", authController, async (req, res) => {
  const [{ data, error: parseError }, jsonError] = tryCatch(() => Schema.safeParse(JSON.parse(decodeURIComponent(req.query.filters as string))));
  if (parseError || jsonError) return res.status(400).json({ error: "Invalid request parameters" });

  const offset = parseInt(req.query.offset as string) || 0;
  const limit = parseInt(req.query.limit as string) || 20;
  if (limit > 499) return res.sendStatus(400);

  const results = await requestSearchClasses(data.term, data, offset, limit);
  const [classes, total] = results;

  const parsedClasses: TruncatedClassData[] = [];
  classes.forEach((c) => {
    const professor = c.faculty.find((f) => f.primaryIndicator);
    const [rmpData, error] = professor
      ? tryCatch<{ rmp_id: number; overall_rating: number; num_ratings: number; percent_take_again: number; level_of_difficulty: number }>(
          () => db.prepare("SELECT rmp_id, overall_rating, num_ratings, percent_take_again, level_of_difficulty FROM professors WHERE school_name = ?").get(professor.displayName) as any
        )
      : [];
    if (error) return console.error(error);

    if (data.professorRating && rmpData?.overall_rating && (rmpData.overall_rating < data.professorRating[0] || rmpData.overall_rating > data.professorRating[1])) return;

    parsedClasses.push({
      term: c.term,
      courseReferenceNumber: c.courseReferenceNumber,
      subject: c.subject,
      courseNumber: c.courseNumber,
      courseTitle: c.courseTitle,
      sequenceNumber: c.sequenceNumber,
      seatsAvailable: c.seatsAvailable,
      maximumEnrollment: c.maximumEnrollment,
      waitCount: c.waitCount,
      waitCapacity: c.waitCapacity,

      lastUpdated: null,
      seat24h: null,
      seat28d: null,
      wait24h: null,
      wait28d: null,

      credits: c.meetingsFaculty[0]?.meetingTime.creditHourSession ?? 0,
      meeting: {
        building: c.meetingsFaculty[0]?.meetingTime.building ?? "",
        buildingDescription: c.meetingsFaculty[0]?.meetingTime.buildingDescription ?? "",
        room: c.meetingsFaculty[0]?.meetingTime.room ?? "",
        campus: c.meetingsFaculty[0]?.meetingTime.campus ?? "",
        campusDescription: c.meetingsFaculty[0]?.meetingTime.campusDescription ?? "",
        scheduleType: c.meetingsFaculty[0]?.meetingTime.meetingScheduleType ?? "",
        instructionalMethodDescription: c.instructionalMethodDescription ?? "",
        time: [c.meetingsFaculty[0]?.meetingTime.beginTime ?? "", c.meetingsFaculty[0]?.meetingTime.endTime ?? ""],
        days: [
          c.meetingsFaculty[0]?.meetingTime.sunday ?? false,
          c.meetingsFaculty[0]?.meetingTime.monday ?? false,
          c.meetingsFaculty[0]?.meetingTime.tuesday ?? false,
          c.meetingsFaculty[0]?.meetingTime.wednesday ?? false,
          c.meetingsFaculty[0]?.meetingTime.thursday ?? false,
          c.meetingsFaculty[0]?.meetingTime.friday ?? false,
          c.meetingsFaculty[0]?.meetingTime.saturday ?? false
        ]
      },
      attributes: c.sectionAttributes.map((a) => a.code),

      professorLeaked: professor?.leaked,
      professorId: professor?.bannerId ?? "",
      professorName: professor?.displayName ?? "",
      rmpId: rmpData?.rmp_id ?? null,
      rmpRating: rmpData?.overall_rating ?? null,
      rmpNumRatings: rmpData?.num_ratings ?? null,
      rmpTakeAgain: rmpData?.percent_take_again ?? null,
      rmpDifficulty: rmpData?.level_of_difficulty ?? null
    });
  });

  return res.status(200).json({ classes: parsedClasses, total });
});

router.get("/class/history/:term/:crn", authController, (req, res) => {
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

router.get("/class/description/:term/:crn", authController, async (req, res) => {
  const { term, crn } = req.params;
  if (!term || typeof term !== "string" || !crn || typeof crn !== "string") return res.status(400).json({ error: "Missing term or crn" });

  const [data, error] = tryCatch(() => fetchClassDescription(term, crn));
  if (error) {
    if (error.message === "Course description not found") return res.status(404).json({ error: "Course description not found" });
    return res.sendStatus(500);
  }

  return res.status(200).json({ description: await data });
});

export default router;
