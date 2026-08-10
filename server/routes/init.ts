import { NotificationType, TruncatedClassData } from "../utils/types";
import { fetchClasses, tryCatch } from "../utils/fetch";
import { authController } from "../controllers/auth";
import { toCamelCase } from "../utils/functions";
import { CLIENT } from "../../bot/src/common";
import { Cookie } from "../utils/cookie";
import { db } from "../utils/sqlite";
import { Router } from "express";
import ENV from "../../env";

const router = Router();

router.get("/init", authController, async (req, res) => {
  const user = await CLIENT.client?.users.fetch(req.user.discordId);
  if (ENV.DISCORD_TOKEN && !user) return res.sendStatus(404);

  const [watchers, error2] = tryCatch<{ uuid: string; term_id: string; crn: string; notify_when: NotificationType; notify_when_value: number }[]>(
    () => db.prepare("SELECT uuid, term_id, crn, notify_when, notify_when_value FROM watchers WHERE owner_uuid = ?").all(req.user.uuid) as any
  );
  if (error2) return res.sendStatus(500);

  const [schedules, error3] = tryCatch<{ uuid: string; term_id: string; name: string; crns: string }[]>(
    () => db.prepare("SELECT uuid, term_id, name, crns FROM schedules WHERE owner_uuid = ?").all(req.user.uuid) as any
  );
  if (error3) return res.sendStatus(500);

  const terms = Array.from(new Set(watchers.map((watcher) => watcher.term_id)));
  const classes = await Promise.all(
    terms.map(async (term) => {
      const data = await fetchClasses(term, new Set(watchers.filter((watcher) => watcher.term_id === term).map((watcher) => watcher.crn)));
      const classMap = new Map<string, TruncatedClassData>(); // Map<CRN, TruncatedClassData>

      data.forEach((c) => {
        const professor = c.faculty.find((f) => f.primaryIndicator);
        const [rmpData, error] = professor
          ? tryCatch<{ rmp_id: number; overall_rating: number; num_ratings: number; percent_take_again: number; level_of_difficulty: number }>(
              () => db.prepare("SELECT rmp_id, overall_rating, num_ratings, percent_take_again, level_of_difficulty FROM professors WHERE school_name = ?").get(professor.displayName) as any
            )
          : [];
        if (error) return console.error(error);

        const [history, error2] = tryCatch<{
          "24h_timestamp": number;
          seat_24h: string;
          seat_28d: string;
          wait_24h: string | null;
          wait_28d: string | null;
        }>(() => db.prepare('SELECT "24h_timestamp", seat_24h, seat_28d, wait_24h, wait_28d FROM course_history WHERE term_id = ? AND crn = ?').get(c.term, c.courseReferenceNumber) as any);
        if (error2) return console.error(error2);

        classMap.set(c.courseReferenceNumber, {
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

          lastUpdated: history?.["24h_timestamp"] ?? null,
          seat24h: history ? JSON.parse(history.seat_24h) : null,
          seat28d: history ? JSON.parse(history.seat_28d) : null,
          wait24h: history?.wait_24h ? JSON.parse(history.wait_24h) : null,
          wait28d: history?.wait_28d ? JSON.parse(history.wait_28d) : null,

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

          professorId: professor?.bannerId ?? "",
          professorName: professor?.displayName ?? "",
          rmpId: rmpData?.rmp_id ?? null,
          rmpRating: rmpData?.overall_rating ?? null,
          rmpNumRatings: rmpData?.num_ratings ?? null,
          rmpTakeAgain: rmpData?.percent_take_again ?? null,
          rmpDifficulty: rmpData?.level_of_difficulty ?? null
        });
      });
      return classMap;
    })
  );

  const watchersWithData = watchers.map((watcher) => ({
    ...toCamelCase(watcher),
    ...classes[terms.findIndex((term) => term === watcher.term_id)]?.get(watcher.crn)
  }));

  res.status(200).json({
    discord: {
      id: req.user.discordId,
      displayName: user?.displayName,
      username: user?.username,
      avatar: user?.avatar
    },
    validTerms: Cookie.getMostRecentTerms(),
    attributes: Cookie.attributes,
    subjects: Cookie.subjects,
    watchers: toCamelCase(watchersWithData),
    schedules: toCamelCase(schedules.map((schedule) => ({ ...schedule, crns: JSON.parse(schedule.crns) })))
  });
});

export default router;
