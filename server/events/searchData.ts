import { ClientManager } from "../utils/clientManager";
import { waitForInterval } from "../utils/functions";
import { searchClasses } from "../utils/fetch";
import { decodeHTML } from "entities";
import { db } from "../utils/sqlite";
import { Log } from "../utils/log";
import ENV from "../../env";

export function fetchSearchDataLoop(): void {
  waitForInterval(ENV.SEARCH_FETCH_INTERVAL, ENV.SEARCH_FETCH_OFFSET, async () => {
    let updatedLocations = false;

    for (const term of ClientManager.terms ?? []) {
      Log.info(`Fetching classes for ${term.getTermString()}`);

      const [allClasses] = await searchClasses(term.termId, {}, term.isPrimary && !term.isEarly ? true : false); // ? use external for other terms cuz cookies and shit

      db.transaction(() => {
        db.prepare(`DROP TABLE IF EXISTS "${term.termId}_search_db"`).run();
        db.prepare(`DROP TABLE IF EXISTS "${term.termId}_search_db_attributes"`).run();

        db.prepare(
          `CREATE TABLE "${term.termId}_search_db" (
    crn            TEXT    UNIQUE NOT NULL PRIMARY KEY,
    subject        TEXT,
    course_number  TEXT,
    section        TEXT,
    course_title   TEXT,
    credit_hours   INTEGER,
    professor_name TEXT,
    location       TEXT,
    sunday         INTEGER,
    monday         INTEGER,
    tuesday        INTEGER,
    wednesday      INTEGER,
    thursday       INTEGER,
    friday         INTEGER,
    saturday       INTEGER,
    start_time     TEXT,
    end_time       TEXT
)`
        ).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_${term.termId}_search_ordering ON "${term.termId}_search_db"(subject, course_number, section)`).run();
        db.prepare(
          `CREATE TABLE "${term.termId}_search_db_attributes" (
          crn TEXT NOT NULL, 
          attribute TEXT NOT NULL,
          PRIMARY KEY (crn, attribute)
        )`
        ).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_${term.termId}_search_db_attributes_attribute ON "${term.termId}_search_db_attributes"(attribute)`).run();

        const insertStatement = db.prepare(
          `INSERT INTO "${term.termId}_search_db" (crn, subject, course_number, section, course_title, credit_hours, professor_name, location, sunday, monday, tuesday, wednesday, thursday, friday, saturday, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const insertAttributeStatement = db.prepare(`INSERT INTO "${term.termId}_search_db_attributes" (crn, attribute) VALUES (?, ?)`);

        for (const course of allClasses) {
          const meetingTime = course.meetingsFaculty[0]?.meetingTime;
          insertStatement.run(
            ...[
              course.courseReferenceNumber,
              course.subject,
              course.courseNumber,
              course.sequenceNumber,
              decodeHTML(course.courseTitle),
              meetingTime.creditHourSession,
              course.faculty[0]?.displayName
                .replaceAll(/,|\.|\-|\([A-Za-z]{1,3}\/[A-Za-z]{1,3}\)/g, " ")
                .split(" ")
                .filter((w) => w.length > 1)
                .sort()
                .join(" "),
              meetingTime.building,
              Number(meetingTime.sunday === true),
              Number(meetingTime.monday === true),
              Number(meetingTime.tuesday === true),
              Number(meetingTime.wednesday === true),
              Number(meetingTime.thursday === true),
              Number(meetingTime.friday === true),
              Number(meetingTime.saturday === true),
              meetingTime.beginTime,
              meetingTime.endTime
            ].map((val) => (val === undefined ? null : val))
          );

          for (const attribute of course.sectionAttributes) insertAttributeStatement.run(course.courseReferenceNumber, attribute.code);
        }
      })();

      if (!updatedLocations)
        db.transaction(() => {
          updatedLocations = true;

          db.prepare("DELETE FROM locations").run();
          const insertLocationStatement = db.prepare(`INSERT INTO locations (short, long) VALUES (?, ?)`);

          const locations = [
            ...new Set(
              allClasses.filter((c) => c.meetingsFaculty[0]?.meetingTime.building).map((c) => `${c.meetingsFaculty[0]?.meetingTime.building}:${c.meetingsFaculty[0]?.meetingTime.buildingDescription}`)
            )
          ]
            .sort((a, b) => a.localeCompare(b))
            .map((location) => {
              const [short, long] = location.split(":");
              return [short, decodeHTML(long)];
            });

          for (const location of locations) insertLocationStatement.run(...location);
          Log.info(`Inserted ${locations.length} locations from ${term.getTermString()}`);
        })();

      Log.info(`Fetched ${allClasses.length} classes for ${term.getTermString()}`);
    }
  });
}
