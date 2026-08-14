import { ClassSearchSchema, TruncatedClassData } from "../../utils/types";
import { searchClassDb, tryCatch } from "../../utils/fetch";
import { authController } from "../../controllers/auth";
import { db } from "../../utils/sqlite";
import { Router } from "express";

const router = Router();

/** /class/search?filters=&offset=&limit= */
router.get("/", authController, async (req, res) => {
  const [{ data: filters, error: parseError }, jsonError] = tryCatch(() => ClassSearchSchema.safeParse(JSON.parse(decodeURIComponent(req.query.filters as string))));
  if (parseError || jsonError) return res.status(400).json({ error: "Invalid request parameters" });

  const offset = parseInt(req.query.offset as string) || 0;
  const limit = parseInt(req.query.limit as string) || 20;
  if (limit > 499) return res.sendStatus(400);

  const results = await searchClassDb(filters.term, filters, offset, limit);
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

    if (filters.strictRatingSearch && (!rmpData || !rmpData.overall_rating)) return;
    if (filters.professorRating && rmpData?.overall_rating && (rmpData.overall_rating < filters.professorRating[0] || rmpData.overall_rating > filters.professorRating[1])) return;

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
      seat7d: null,
      seat28d: null,
      wait24h: null,
      wait7d: null,
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

export default router;
