import { ClassData, NotificationType } from "../utils/types";
import { fetchClasses, tryCatch } from "../utils/fetch";
import { authController } from "../controllers/auth";
import { toCamelCase } from "../utils/functions";
import { CLIENT } from "../../bot/src/common";
import { Cookie } from "../utils/cookie";
import { db } from "../utils/sqlite";
import { Router } from "express";

const router = Router();

router.get("/init", authController, async (req, res) => {
  type TruncatedClassData = {
    term: ClassData["term"];
    courseReferenceNumber: ClassData["courseReferenceNumber"];
    subject: ClassData["subject"];
    courseNumber: ClassData["courseNumber"];
    courseTitle: ClassData["courseTitle"];
    sequenceNumber: ClassData["sequenceNumber"];
    seatsAvailable: ClassData["seatsAvailable"];
    maximumEnrollment: ClassData["maximumEnrollment"];
    waitCount: ClassData["waitCount"];
    waitCapacity: ClassData["waitCapacity"];
    lastUpdated: number | null;
    seat24h: number | null;
    seat28d: number | null;
    wait24h: number | null;
    wait28d: number | null;
    credits: ClassData["meetingsFaculty"][number]["meetingTime"]["creditHourSession"];
    meeting: {
      building: ClassData["meetingsFaculty"][number]["meetingTime"]["building"];
      buildingDescription: ClassData["meetingsFaculty"][number]["meetingTime"]["buildingDescription"];
      room: ClassData["meetingsFaculty"][number]["meetingTime"]["room"];
      campus: ClassData["meetingsFaculty"][number]["meetingTime"]["campus"];
      time: [start: ClassData["meetingsFaculty"][number]["meetingTime"]["beginTime"], end: ClassData["meetingsFaculty"][number]["meetingTime"]["endTime"]];
      days: [sun: boolean, mon: boolean, tue: boolean, wed: boolean, thu: boolean, fri: boolean, sat: boolean];
    };
    professorId: ClassData["faculty"][number]["bannerId"];
    professorName: ClassData["faculty"][number]["displayName"];
    rmpId: number | null;
    rmpRating: number | null;
    rmpNumRatings: number | null;
    rmpDifficulty: number | null;
    rmpTakeAgain: number | null;
  };

  const user = await CLIENT.client?.users.fetch(req.user.discordId);
  if (!user) return res.sendStatus(404);

  const [watchers, error2] = tryCatch<{ uuid: string; owner_uuid: string; term_id: string; crn: string; notify_when: NotificationType; notify_when_value: number }[]>(
    () => db.prepare("SELECT * FROM watchers WHERE owner_uuid = ?").all(req.user.uuid) as any
  );
  if (error2) return res.sendStatus(500);

  const terms = Array.from(new Set(watchers.map((watcher) => watcher.term_id)));
  const classes = await Promise.all(
    terms.map(async (term) => {
      const data = await fetchClasses(term, new Set(watchers.filter((watcher) => watcher.term_id === term).map((watcher) => watcher.crn)));
      const classMap = new Map<string, TruncatedClassData>(); // Map<CRN, TruncatedClassData>

      data.forEach((c) => {
        const professor = c.faculty.find((f) => f.primaryIndicator);
        const [rmpData, error] = professor
          ? tryCatch<{ rmp_id: number; overall_rating: number; num_ratings: number; percent_take_again: number; level_of_difficulty: number }>(
              () => db.prepare("SELECT rmp_id, overall_rating, num_ratings, percent_take_again, level_of_difficulty FROM professors WHERE bing_name = ?").get(professor.displayName) as any
            )
          : [];
        if (error) return console.error(error);

        const [history, error2] = tryCatch<{
          seat_24h: string;
          seat_24h_time: number;
          seat_28d: string;
          seat_28d_time: number;
          wait_24h: string | null;
          wait_24h_time: number | null;
          wait_28d: string | null;
          wait_28d_time: number | null;
        }>(() => db.prepare("SELECT * FROM course_history WHERE term_id = ? AND crn = ?").get(c.term, c.courseReferenceNumber) as any);
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

          lastUpdated: history ? Math.max(history.seat_24h_time, history.seat_28d_time, history.wait_24h_time ?? 0, history.wait_28d_time ?? 0) : null,
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
      displayName: user.displayName,
      username: user.username,
      avatar: user.avatar
    },
    validTerms: Cookie.getMostRecentTerms(),
    attributes: Cookie.attributes,
    subjects: Cookie.subjects,
    watchers: toCamelCase(watchersWithData)
  });
});

export default router;
