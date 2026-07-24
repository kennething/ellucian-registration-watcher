import { ClassData, NotificationType } from "../utils/types";
import { fetchClasses, tryCatch } from "../utils/fetch";
import { toCamelCase } from "../utils/functions";
import { Cookie } from "../utils/cookie";
import { db } from "../utils/sqlite";
import { Router } from "express";

const router = Router();

router.post("/init", async (req, res) => {
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
  };

  const uuid: string = req.body.uuid;
  if (!uuid || typeof uuid !== "string") return res.sendStatus(404);

  const [user, error] = tryCatch(() => db.prepare("SELECT * FROM users WHERE uuid = ?").get(uuid) as any);
  if (error || !user) return res.sendStatus(404);

  const [watchers, error2] = tryCatch<{ uuid: string; owner_uuid: string; term_id: string; crn: string; notification_priority: number; notify_when: NotificationType; notify_when_value: number }[]>(
    () => db.prepare("SELECT * FROM watchers WHERE owner_uuid = ?").all(uuid) as any
  );
  if (error2) return res.sendStatus(500);

  const terms = Array.from(new Set(watchers.map((watcher) => watcher.term_id)));
  const classes = await Promise.all(
    terms.map(async (term) => {
      const data = await fetchClasses(term, new Set(watchers.filter((watcher) => watcher.term_id === term).map((watcher) => watcher.crn)));
      const classMap = new Map<string, TruncatedClassData>(); // Map<CRN, TruncatedClassData>

      data.forEach((c) =>
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
          waitCapacity: c.waitCapacity
        })
      );
      return classMap;
    })
  );

  const watchersWithData = watchers.map((watcher) => ({
    ...toCamelCase(watcher),
    ...classes[terms.findIndex((term) => term === watcher.term_id)]?.get(watcher.crn)
  }));

  res.status(200).json({ validTerms: Cookie.getMostRecentTerms(), attributes: Cookie.attributes, subjects: Cookie.subjects, watchers: toCamelCase(watchersWithData) });
});

export default router;
