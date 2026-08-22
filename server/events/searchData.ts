import { requestSearchClasses } from "../utils/fetch";
import { waitForInterval } from "../utils/functions";
import { Cookie } from "../utils/cookie";
import { db } from "../utils/sqlite";
import ENV from "../../env";

export function fetchSearchData(): void {
  waitForInterval(ENV.SEARCH_FETCH_INTERVAL, ENV.SEARCH_FETCH_OFFSET, async () => {
    for (const term of Cookie.getMostRecentTerms() ?? []) {
      const [allClasses] = await requestSearchClasses(term, {});

      db.transaction(() => {
        db.prepare(`DROP TABLE IF EXISTS "${term}_search_db"`).run();
        db.prepare(`DROP TABLE IF EXISTS "${term}_search_db_attributes"`).run();

        db.prepare(
          `CREATE TABLE "${term}_search_db" (
    crn            TEXT    UNIQUE NOT NULL PRIMARY KEY,
    subject        TEXT,
    course_number  TEXT,
    section        TEXT,
    course_title   TEXT,
    credit_hours   INTEGER,
    professor_name TEXT,
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
        db.prepare(
          `CREATE TABLE "${term}_search_db_attributes" (
          crn TEXT NOT NULL, 
          attribute TEXT NOT NULL,
          PRIMARY KEY (crn, attribute)
        )`
        ).run();
        db.prepare(`CREATE INDEX idx_${term}_search_db_attributes_attribute ON "${term}_search_db_attributes"(attribute)`).run();

        const insertStatement = db.prepare(
          `INSERT INTO "${term}_search_db" (crn, subject, course_number, section, course_title, credit_hours, professor_name, sunday, monday, tuesday, wednesday, thursday, friday, saturday, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const insertAttributeStatement = db.prepare(`INSERT INTO "${term}_search_db_attributes" (crn, attribute) VALUES (?, ?)`);

        for (const course of allClasses) {
          const meetingTime = course.meetingsFaculty[0]?.meetingTime;
          insertStatement.run(
            ...[
              course.courseReferenceNumber,
              course.subject,
              course.courseNumber,
              course.sequenceNumber,
              course.courseTitle,
              meetingTime.creditHourSession,
              course.faculty[0]?.displayName,
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

      console.log(`${new Date().toLocaleString()}: Fetched ${allClasses.length} classes for ${term}`);
    }
  });
}
