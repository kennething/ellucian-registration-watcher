import { fetchClasses, requestSearchClasses, tryCatch } from "./fetch";
import { ClassData, NotificationType } from "./types";
import { CLIENT } from "../../bot/src/common";
import { ComponentType } from "discord.js";
import { getMathSchedule } from "./math";
import { getRMPData } from "./rmp";
import { Cookie } from "./cookie";
import { db } from "./sqlite";
import ENV from "../../env";
import Fuse from "fuse.js";
import path from "path";

/** Waits for a specified interval and then calls the callback function
 * @param interval The interval in seconds at which to call the callback function. The first call will be aligned to the nearest interval.
 * @param offset offset in seconds
 */
function waitForInterval(interval: number, offset: number, callback: () => Promise<void>): void {
  const intervalMs = interval * 1000;
  const timeUntilInterval = intervalMs - (Date.now() % intervalMs);

  setTimeout(
    () => {
      callback();
      setInterval(callback, intervalMs);
    },
    timeUntilInterval + offset * 1000
  );
}

export function watchClassesLoop(): void {
  type NotificationData = {
    courseReferenceNumber: ClassData["courseReferenceNumber"];
    seatsAvailable: ClassData["seatsAvailable"];
    sequenceNumber: ClassData["sequenceNumber"];
    subject: ClassData["subject"];
    courseNumber: ClassData["courseNumber"];
    waitCount: ClassData["waitCount"];
    waitCapacity: ClassData["waitCapacity"];
  } & Partial<{
    notifyWhen: NotificationType;
    notifyWhenValue: number;
  }>;

  type CourseHistory = {
    crn: number;
    term_id: number;
    "24h_timestamp": number;
    "28d_timestamp": number;
    seat_24h: string;
    seat_28d: string;
    wait_24h: string;
    wait_28d: string;
  };

  waitForInterval(ENV.CLASS_FETCH_INTERVAL, ENV.CLASS_FETCH_OFFSET, async () => {
    const mostRecentTerms = Cookie.getMostRecentTerms();

    if (!mostRecentTerms) return;

    const [watchers, error] = tryCatch<{ owner_uuid: string; last_notified: number | null; term_id: string; crn: string; notify_when: NotificationType; notify_when_value: number }[]>(
      () =>
        db
          .prepare(`SELECT owner_uuid, last_notified, term_id, crn, notify_when, notify_when_value FROM watchers WHERE term_id IN (${mostRecentTerms?.map(() => "?").join(", ")})`)
          .all(...mostRecentTerms) as any
    );
    if (error) return;

    const terms = Array.from(new Set(watchers.map((watcher) => watcher.term_id)));
    const classes = await Promise.all(
      terms.map(async (term) => {
        const data = await fetchClasses(term, new Set(watchers.filter((watcher) => watcher.term_id === term).map((watcher) => watcher.crn)));

        const getStatement = db.prepare("SELECT * FROM course_history WHERE crn = ? AND term_id = ?");
        const insertStatement = db.prepare('INSERT INTO course_history (crn, term_id, "24h_timestamp", "28d_timestamp", seat_24h, seat_28d, wait_24h, wait_28d) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

        db.transaction(() => {
          const currentTime = Math.floor(Date.now() / 1000);
          const entries24h = ENV.CLASS_HISTORY_24H_ENTRIES;
          const entries28d = ENV.CLASS_HISTORY_28D_ENTRIES;

          for (const course of data) {
            const row = getStatement.get(course.courseReferenceNumber, course.term) as CourseHistory | undefined;

            if (!row) {
              const seat24h = new Array(entries24h - 1).fill(-1);
              seat24h.push(course.seatsAvailable);
              const seat28d = new Array(entries28d - 1).fill(-1);
              seat28d.push(course.seatsAvailable);
              const wait24h = course.waitCapacity !== 0 ? new Array(entries24h - 1).fill(-1) : null;
              if (wait24h) wait24h.push(course.waitCount);
              const wait28d = course.waitCapacity !== 0 ? new Array(entries28d - 1).fill(-1) : null;
              if (wait28d) wait28d.push(course.waitCount);

              insertStatement.run(
                course.courseReferenceNumber,
                course.term,
                currentTime,
                currentTime,
                JSON.stringify(seat24h),
                JSON.stringify(seat28d),
                wait24h ? JSON.stringify(wait24h) : null,
                wait28d ? JSON.stringify(wait28d) : null
              );
              continue;
            }

            if (currentTime - row["24h_timestamp"] >= 20 * 60) {
              const seat24h = JSON.parse(row.seat_24h) as number[];
              if (!seat24h) continue;
              seat24h.shift();
              seat24h.push(course.seatsAvailable);
              db.prepare('UPDATE course_history SET seat_24h = ?, "24h_timestamp" = ? WHERE crn = ? AND term_id = ?').run(
                JSON.stringify(seat24h),
                currentTime,
                course.courseReferenceNumber,
                course.term
              );
            }
            if (currentTime - row["28d_timestamp"] >= 24 * 60 * 60) {
              const seat28d = JSON.parse(row.seat_28d) as number[];
              if (!seat28d) continue;
              seat28d.shift();
              seat28d.push(course.seatsAvailable);
              db.prepare('UPDATE course_history SET seat_28d = ?, "28d_timestamp" = ? WHERE crn = ? AND term_id = ?').run(
                JSON.stringify(seat28d),
                currentTime,
                course.courseReferenceNumber,
                course.term
              );
            }
            if (course.waitCapacity !== 0) {
              if (currentTime - row["24h_timestamp"] >= 20 * 60) {
                const wait24h = JSON.parse(row.wait_24h) as number[];
                if (!wait24h) continue;
                wait24h.shift();
                wait24h.push(course.waitCount);
                db.prepare("UPDATE course_history SET wait_24h = ? WHERE crn = ? AND term_id = ?").run(JSON.stringify(wait24h), course.courseReferenceNumber, course.term);
              }
              if (currentTime - row["28d_timestamp"] >= 24 * 60 * 60) {
                const wait28d = JSON.parse(row.wait_28d) as number[];
                if (!wait28d) continue;
                wait28d.shift();
                wait28d.push(course.waitCount);
                db.prepare("UPDATE course_history SET wait_28d = ? WHERE crn = ? AND term_id = ?").run(JSON.stringify(wait28d), course.courseReferenceNumber, course.term);
              }
            }
          }

          const oldWatchers = db.prepare('SELECT * FROM course_history WHERE "24h_timestamp" < ? OR "28d_timestamp" < ?').all(currentTime - 20 * 60, currentTime - 86400) as CourseHistory[];
          for (const row of oldWatchers) {
            if (currentTime - row["24h_timestamp"] >= 20 * 60) {
              const seat24h = JSON.parse(row.seat_24h) as number[];
              if (!seat24h) continue;
              seat24h.shift();
              seat24h.push(-1);
              db.prepare('UPDATE course_history SET seat_24h = ?, "24h_timestamp" = ? WHERE crn = ? AND term_id = ?').run(JSON.stringify(seat24h), currentTime, row.crn, row.term_id);
            }
            if (currentTime - row["28d_timestamp"] >= 24 * 60 * 60) {
              const seat28d = JSON.parse(row.seat_28d) as number[];
              if (!seat28d) continue;
              seat28d.shift();
              seat28d.push(-1);
              db.prepare('UPDATE course_history SET seat_28d = ?, "28d_timestamp" = ? WHERE crn = ? AND term_id = ?').run(JSON.stringify(seat28d), currentTime, row.crn, row.term_id);
            }
            if (row.wait_24h !== null && row.wait_28d !== null) {
              if (currentTime - row["24h_timestamp"] >= 20 * 60) {
                const wait24h = JSON.parse(row.wait_24h) as number[];
                if (!wait24h) continue;
                wait24h.shift();
                wait24h.push(-1);
                db.prepare("UPDATE course_history SET wait_24h = ? WHERE crn = ? AND term_id = ?").run(JSON.stringify(wait24h), row.crn, row.term_id);
              }
              if (currentTime - row["28d_timestamp"] >= 24 * 60 * 60) {
                const wait28d = JSON.parse(row.wait_28d) as number[];
                if (!wait28d) continue;
                wait28d.shift();
                wait28d.push(-1);
                db.prepare("UPDATE course_history SET wait_28d = ? WHERE crn = ? AND term_id = ?").run(JSON.stringify(wait28d), row.crn, row.term_id);
              }
            }
          }

          console.log(`${new Date().toLocaleString()}: Updated course history for ${data.length} classes for term ${term}`);
        })();

        const classMap = new Map<string, NotificationData>(); // Map<CRN, NotificationData>

        data.forEach((c) =>
          classMap.set(c.courseReferenceNumber, {
            courseReferenceNumber: c.courseReferenceNumber,
            seatsAvailable: c.seatsAvailable,
            sequenceNumber: c.sequenceNumber,
            subject: c.subject,
            courseNumber: c.courseNumber,
            waitCount: c.waitCount,
            waitCapacity: c.waitCapacity
          })
        );
        return classMap;
      })
    );

    const notificationsToSend = new Map<string, NotificationData[]>();
    const updateLastNotified = db.transaction((crn: string, ownerUuid: string, term: string) =>
      tryCatch(() => db.prepare("UPDATE watchers SET last_notified = ? WHERE crn = ? AND owner_uuid = ? AND term_id = ?").run(Math.floor(Date.now() / 1000), crn, ownerUuid, term))
    );
    for (const watcher of watchers) {
      if (watcher.last_notified && Date.now() / 1000 - watcher.last_notified < ENV.NOTIFICATION_COOLDOWN) continue;

      const termIndex = terms.findIndex((term) => term === watcher.term_id);
      const classData = classes[termIndex]?.get(watcher.crn);

      if (
        classData &&
        ((watcher.notify_when === NotificationType.SEAT_GREATER_THAN && classData.seatsAvailable >= watcher.notify_when_value) ||
          (watcher.notify_when === NotificationType.SEAT_LESS_THAN && classData.seatsAvailable <= watcher.notify_when_value) ||
          (watcher.notify_when === NotificationType.WAIT_GREATER_THAN && classData.waitCount >= watcher.notify_when_value) ||
          (watcher.notify_when === NotificationType.WAIT_LESS_THAN && classData.waitCount <= watcher.notify_when_value))
      ) {
        if (!notificationsToSend.has(watcher.owner_uuid)) notificationsToSend.set(watcher.owner_uuid, []);
        updateLastNotified(watcher.crn, watcher.owner_uuid, watcher.term_id);
        notificationsToSend.get(watcher.owner_uuid)?.push({ ...classes[termIndex].get(watcher.crn), notifyWhen: watcher.notify_when, notifyWhenValue: watcher.notify_when_value } as NotificationData);
      }
    }

    for (const [uuid, availableClasses] of notificationsToSend) {
      const [{ discord_id: discordId }, error] = tryCatch<{ discord_id: string }>(() => db.prepare("SELECT discord_id FROM users WHERE uuid = ?").get(uuid) as any);
      if (error) return;

      const user = await CLIENT.client?.users.fetch(discordId);
      user?.send({
        embeds: [
          {
            title: `Watcher${availableClasses.length > 1 ? "s" : ""} Triggered`,
            description:
              availableClasses
                .map(
                  (c) =>
                    `- **${c.subject} ${c.courseNumber} - ${c.sequenceNumber}** has ${c.notifyWhen! < 2 ? c.seatsAvailable : c.waitCount} ${c.notifyWhen! < 2 ? `seat${c.seatsAvailable === 1 ? "" : "s"} available` : `waitlist spot${c.waitCount === 1 ? "" : "s"} taken`}`
                )
                .join("\n") +
              `\nTh${availableClasses.length > 1 ? "ese" : "is"} watcher${availableClasses.length > 1 ? "s" : ""} will be able to notify you again <t:${Math.floor((Date.now() + ENV.NOTIFICATION_COOLDOWN * 1000) / 1000)}:R>`,
            color: ENV.PRIMARY_COLOR,
            timestamp: new Date().toISOString()
          }
        ],
        components: ENV.FRONTEND_URL
          ? [
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.Button,
                    label: `Edit Watcher${availableClasses.length > 1 ? "s" : ""}`,
                    style: 5,
                    url: `${ENV.FRONTEND_URL}/watch`
                  }
                ]
              }
            ]
          : undefined
        // flags: availableClasses.every((c) => c.notification_priority === 0) ? MessageFlags.SuppressNotifications : undefined
      });
    }
  });
}

export function purgeOutdatedLoop(): void {
  const termStrings = {
    "10": "Winter",
    "20": "Spring",
    "60": "Summer",
    "90": "Fall"
  } as const;

  const termsToDelete = new Map<string, number>(); // Map<termId, timestampToDelete>
  waitForInterval(ENV.OUTDATED_PURGE_INTERVAL, ENV.OUTDATED_PURGE_OFFSET, async () => {
    const mostRecentTerms = Cookie.getMostRecentTerms();
    if (!mostRecentTerms) return;
    const mostRecentTermStrings: `${(typeof termStrings)[keyof typeof termStrings]} ${number}`[] = mostRecentTerms.map(
      (term) => `${termStrings[term.slice(-2) as keyof typeof termStrings]} ${term.slice(0, -2)}`
    ) as any;

    const isDeletingTerms = termsToDelete.size && Array.from(termsToDelete).some(([, deleteTimestamp]) => Date.now() >= deleteTimestamp * 1000);
    if (isDeletingTerms) {
      const backupPath = path.join(ENV.BACKUP_DATABASE_PATH, `backup_${Math.floor(Date.now() / 1000)}.sqlite3`);
      await db.backup(backupPath);
      console.log(`${new Date().toLocaleString()}: Backed up database before purging to ${backupPath}`);

      for (const [termId] of termsToDelete) {
        // * outdated watchers
        const { count } = db.prepare("DELETE FROM watchers WHERE term_id = ? RETURNING COUNT(*) as count").get(termId) as { count: number };
        termsToDelete.delete(termId);
        console.log(`${new Date().toLocaleString()}: Purged ${count} outdated watchers for term ${termId}`);

        // * outdated search db
        db.prepare(`DROP TABLE IF EXISTS "${termId}_search_db"`).run();
        db.prepare(`DROP TABLE IF EXISTS "${termId}_search_db_attributes"`).run();
        console.log(`${new Date().toLocaleString()}: Dropped search db table for term ${termId}`);

        // * outdated math schedules
        if (ENV.MATH_SCHEDULE_URL) {
          db.prepare(`DROP TABLE IF EXISTS "${termId}_math_schedule"`).run();
          console.log(`${new Date().toLocaleString()}: Dropped math schedule table for term ${termId}`);
        }
      }

      termsToDelete.clear();
      return;
    }

    const [allTerms, error] = tryCatch<{ term_id: string }[]>(db.prepare("SELECT DISTINCT term_id FROM watchers").all() as any);
    if (error) return;

    const outdatedTerms = allTerms.filter((term) => !mostRecentTerms.includes(term.term_id));
    outdatedTerms.forEach((term) => termsToDelete.set(term.term_id, Math.floor(Date.now() / 1000) + ENV.WATCHER_PURGE_NOTICE));
    if (!outdatedTerms.length) return;

    const [usersToNotify, error2] = tryCatch<{ owner_uuid: string }[]>(
      db.prepare(`SELECT DISTINCT owner_uuid FROM watchers WHERE term_id IN (${outdatedTerms.map(() => "?").join(",")})`).all(...outdatedTerms.map((term) => term.term_id)) as any
    );
    if (error2) return;

    for (const user of usersToNotify) {
      const [{ discord_id: discordId }, error] = tryCatch<{ discord_id: string }>(() => db.prepare("SELECT discord_id FROM users WHERE uuid = ?").get(user.owner_uuid) as any);
      if (error) return;

      const discordUser = await CLIENT.client?.users.fetch(discordId);
      discordUser?.send({
        embeds: [
          {
            title: "A watcher is being removed",
            description: `One or more of your watchers is for an outdated term and will be automatically deleted in 7 days.\nWatchers for the ${mostRecentTermStrings.join(" and ")} term${mostRecentTermStrings.length > 1 ? "s" : ""} will not be affected.`,
            color: 0xff0000,
            footer: { text: "No action is required from you." },
            timestamp: new Date().toISOString()
          }
        ]
      });
    }

    console.log(`${new Date().toLocaleString()}: Purging ${outdatedTerms.join(", ")} in 7 days`);
  });
}

export function fetchProfessorsLoop(): void {
  waitForInterval(ENV.RMP_FETCH_INTERVAL, ENV.RMP_FETCH_OFFSET, async () => {
    const rmpProfessors = (await getRMPData()).map((professor) => ({
      ...professor,
      sortedName: professor.name
        .replaceAll(/,|\.|\-/g, " ")
        .split(" ")
        .filter((w) => w.length > 1)
        .sort()
        .join(" ")
    }));
    // ! bing professor id isnt consistent ??
    const bingProfessors = (
      await Cookie.requestClient.get<{ code: string; description: string }[]>(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/get_instructor?searchTerm=&term=202690&offset=1&max=2000`)
    ).data.map((professor) => ({
      ...professor,
      sortedName: professor.description
        .replaceAll(/,|\.|\-|\([A-Za-z]{1,3}\/[A-Za-z]{1,3}\)/g, " ")
        .split(" ")
        .filter((w) => w.length > 1)
        .sort()
        .join(" ")
    }));

    const searcher = new Fuse(rmpProfessors, { useTokenSearch: true, tokenMatch: "all", keys: ["name"], threshold: 0.25, shouldSort: true, ignoreDiacritics: true });

    const finalProfessors = bingProfessors.map((professor) => {
      const result = searcher.search(professor.description);
      const match = result[0]?.item;

      return {
        school_id: professor.code,
        school_name: professor.description,
        rmp_id: match?.id ?? null,
        rmp_name: match?.name ?? null,
        overall_rating: match?.overall_rating ?? null,
        num_ratings: match?.num_ratings ?? null,
        percent_take_again: match?.percent_take_again ?? null,
        level_of_difficulty: match?.level_of_difficulty ?? null
      };
    });

    db.transaction(() => {
      db.prepare("DELETE FROM professors").run();

      const columns = Object.keys(finalProfessors[0]);
      const statement = db.prepare(`INSERT INTO professors (${columns.join(", ")}) VALUES (${columns.map((c) => `@${c}`).join(", ")})`);
      for (const professor of finalProfessors) statement.run(professor);
    })();

    console.log(`${new Date().toLocaleString()}: Fetched ${finalProfessors.length} professors from RMP and Binghamton`);
  });
}

export function fetchMathScheduleLoop(): void {
  waitForInterval(ENV.MATH_FETCH_INTERVAL, ENV.MATH_FETCH_OFFSET, async () => {
    for (const term of Cookie.getMostRecentTerms() ?? []) {
      const professors = await getMathSchedule(term.slice(0, -1));

      db.transaction(() => {
        db.prepare(`DROP TABLE IF EXISTS "${term}_math_schedule"`).run();
        db.prepare(`CREATE TABLE "${term}_math_schedule" (crn TEXT PRIMARY KEY UNIQUE, professor TEXT)`).run();

        const statement = db.prepare(`INSERT INTO "${term}_math_schedule" (crn, professor) VALUES (?, ?)`);
        for (const professor of professors) statement.run(...professor);
      })();

      console.log(`${new Date().toLocaleString()}: Fetched ${professors.size} professors from Math for term ${term}`);
    }
  });
}

export function fetchSearchData(): void {
  waitForInterval(ENV.SEARCH_FETCH_INTERVAL, ENV.SEARCH_FETCH_OFFSET, async () => {
    for (const term of Cookie.getMostRecentTerms() ?? []) {
      console.log("a", Date.now());
      const [allClasses] = await requestSearchClasses(term, {});
      console.log("b", Date.now());

      db.transaction(() => {
        console.log("c");
        db.prepare(`DROP TABLE IF EXISTS "${term}_search_db"`).run();
        console.log("d");
        db.prepare(`DROP TABLE IF EXISTS "${term}_search_db_attributes"`).run();

        console.log("e");
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
        console.log("f");
        db.prepare(
          `CREATE TABLE "${term}_search_db_attributes" (
          crn TEXT NOT NULL, 
          attribute TEXT NOT NULL,
          PRIMARY KEY (crn, attribute)
        )`
        ).run();
        console.log("1");
        db.prepare(`CREATE INDEX idx_202690_search_db_attributes_attribute ON "${term}_search_db_attributes"(attribute)`).run();

        const insertStatement = db.prepare(
          `INSERT INTO "${term}_search_db" (crn, subject, course_number, section, course_title, credit_hours, professor_name, sunday, monday, tuesday, wednesday, thursday, friday, saturday, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const insertAttributeStatement = db.prepare(`INSERT INTO "${term}_search_db_attributes" (crn, attribute) VALUES (?, ?)`);

        console.log("g");
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
        console.log("h");
      })();

      console.log(`${new Date().toLocaleString()}: Fetched ${allClasses.length} classes for ${term}`);
    }
  });
}
