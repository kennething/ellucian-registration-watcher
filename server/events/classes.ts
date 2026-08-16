import { ClassData, Mutable, NotificationType } from "../utils/types";
import { getTermString, waitForInterval } from "../utils/functions";
import { BaseMessageOptions, ComponentType } from "discord.js";
import { fetchClasses, tryCatch } from "../utils/fetch";
import { CLIENT } from "../../bot/src/common";
import { Cookie } from "../utils/cookie";
import { timeNow } from "../utils/time";
import { db } from "../utils/sqlite";
import ENV from "../../env";

export function watchClassesLoop(): void {
  type NotificationData = {
    courseReferenceNumber: ClassData["courseReferenceNumber"];
    seatsAvailable: ClassData["seatsAvailable"];
    sequenceNumber: ClassData["sequenceNumber"];
    subject: ClassData["subject"];
    courseNumber: ClassData["courseNumber"];
    waitCount: ClassData["waitCount"];
    waitCapacity: ClassData["waitCapacity"];
    term: ClassData["term"];
  } & Partial<{
    notifyWhen: NotificationType;
    notifyWhenValue: number;
  }>;

  type CourseHistory = {
    crn: number;
    term_id: number;
    "24h_timestamp": number;
    "7d_timestamp": number;
    "28d_timestamp": number;
    seat_24h: string;
    seat_7d: string;
    seat_28d: string;
    wait_24h: string;
    wait_7d: string;
    wait_28d: string;
  };

  waitForInterval(ENV.CLASS_FETCH_INTERVAL, ENV.CLASS_FETCH_OFFSET, async () => {
    const mostRecentTerms = Cookie.getMostRecentTerms();

    if (!mostRecentTerms) return;

    const [watchers, error] = tryCatch<
      { owner_uuid: string; last_notified: number | null; is_active: number; term_id: string; crn: string; notify_when: NotificationType; notify_when_value: number }[]
    >(
      () =>
        db
          .prepare(`SELECT owner_uuid, last_notified, is_active, term_id, crn, notify_when, notify_when_value FROM watchers WHERE term_id IN (${mostRecentTerms?.map(() => "?").join(", ")})`)
          .all(...mostRecentTerms) as any
    );
    if (error) return;

    const terms = Array.from(new Set(watchers.map((watcher) => watcher.term_id)));
    const classes = await Promise.all(
      terms.map(async (term) => {
        const data = await fetchClasses(term, new Set(watchers.filter((watcher) => watcher.term_id === term).map((watcher) => watcher.crn)));

        const getStatement = db.prepare("SELECT * FROM course_history WHERE crn = ? AND term_id = ?");
        const insertStatement = db.prepare(
          'INSERT INTO course_history (crn, term_id, "24h_timestamp", "7d_timestamp", "28d_timestamp", seat_24h, seat_7d, seat_28d, wait_24h, wait_7d, wait_28d) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        db.transaction(() => {
          const currentTime = timeNow();
          const entries24h = ENV.CLASS_HISTORY_24H_ENTRIES;
          const entries7d = ENV.CLASS_HISTORY_7D_ENTRIES;
          const entries28d = ENV.CLASS_HISTORY_28D_ENTRIES;

          const interval24h = 86400 / ENV.CLASS_HISTORY_24H_ENTRIES;
          const interval7d = (86400 * 7) / ENV.CLASS_HISTORY_7D_ENTRIES;
          const interval28d = (86400 * 28) / ENV.CLASS_HISTORY_28D_ENTRIES;

          for (const course of data) {
            const row = getStatement.get(course.courseReferenceNumber, course.term) as CourseHistory | undefined;

            if (!row) {
              const seat24h = new Array(entries24h - 1).fill(-1);
              seat24h.push(course.seatsAvailable);
              const seat7d = new Array(entries7d - 1).fill(-1);
              seat7d.push(course.seatsAvailable);
              const seat28d = new Array(entries28d - 1).fill(-1);
              seat28d.push(course.seatsAvailable);
              const wait24h = course.waitCapacity !== 0 ? new Array(entries24h - 1).fill(-1) : null;
              if (wait24h) wait24h.push(course.waitCount);
              const wait7d = course.waitCapacity !== 0 ? new Array(entries7d - 1).fill(-1) : null;
              if (wait7d) wait7d.push(course.waitCount);
              const wait28d = course.waitCapacity !== 0 ? new Array(entries28d - 1).fill(-1) : null;
              if (wait28d) wait28d.push(course.waitCount);

              insertStatement.run(
                course.courseReferenceNumber,
                course.term,
                currentTime,
                currentTime,
                currentTime,
                JSON.stringify(seat24h),
                JSON.stringify(seat7d),
                JSON.stringify(seat28d),
                wait24h ? JSON.stringify(wait24h) : null,
                wait7d ? JSON.stringify(wait7d) : null,
                wait28d ? JSON.stringify(wait28d) : null
              );
              continue;
            }

            if (currentTime - row["24h_timestamp"] >= interval24h) {
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
            if (currentTime - row["7d_timestamp"] >= interval7d) {
              const seat7d = JSON.parse(row.seat_7d) as number[];
              if (!seat7d) continue;
              seat7d.shift();
              seat7d.push(course.seatsAvailable);
              db.prepare('UPDATE course_history SET seat_7d = ?, "7d_timestamp" = ? WHERE crn = ? AND term_id = ?').run(JSON.stringify(seat7d), currentTime, course.courseReferenceNumber, course.term);
            }
            if (currentTime - row["28d_timestamp"] >= interval28d) {
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
              if (currentTime - row["24h_timestamp"] >= interval24h) {
                const wait24h = JSON.parse(row.wait_24h) as number[];
                if (!wait24h) continue;
                wait24h.shift();
                wait24h.push(course.waitCount);
                db.prepare("UPDATE course_history SET wait_24h = ? WHERE crn = ? AND term_id = ?").run(JSON.stringify(wait24h), course.courseReferenceNumber, course.term);
              }
              if (currentTime - row["7d_timestamp"] >= interval7d) {
                const wait7d = JSON.parse(row.wait_7d) as number[];
                if (!wait7d) continue;
                wait7d.shift();
                wait7d.push(course.waitCount);
                db.prepare("UPDATE course_history SET wait_7d = ? WHERE crn = ? AND term_id = ?").run(JSON.stringify(wait7d), course.courseReferenceNumber, course.term);
              }
              if (currentTime - row["28d_timestamp"] >= interval28d) {
                const wait28d = JSON.parse(row.wait_28d) as number[];
                if (!wait28d) continue;
                wait28d.shift();
                wait28d.push(course.waitCount);
                db.prepare("UPDATE course_history SET wait_28d = ? WHERE crn = ? AND term_id = ?").run(JSON.stringify(wait28d), course.courseReferenceNumber, course.term);
              }
            }
          }

          const oldWatchers = db
            .prepare('SELECT * FROM course_history WHERE "24h_timestamp" < ? OR "7d_timestamp" < ? OR "28d_timestamp" < ?')
            .all(currentTime - interval24h, currentTime - interval7d, currentTime - interval28d) as CourseHistory[];
          for (const row of oldWatchers) {
            if (currentTime - row["24h_timestamp"] >= interval24h) {
              const seat24h = JSON.parse(row.seat_24h) as number[];
              if (!seat24h) continue;
              seat24h.shift();
              seat24h.push(-1);
              db.prepare('UPDATE course_history SET seat_24h = ?, "24h_timestamp" = ? WHERE crn = ? AND term_id = ?').run(JSON.stringify(seat24h), currentTime, row.crn, row.term_id);
            }
            if (currentTime - row["7d_timestamp"] >= interval7d) {
              const seat7d = JSON.parse(row.seat_7d) as number[];
              if (!seat7d) continue;
              seat7d.shift();
              seat7d.push(-1);
              db.prepare('UPDATE course_history SET seat_7d = ?, "7d_timestamp" = ? WHERE crn = ? AND term_id = ?').run(JSON.stringify(seat7d), currentTime, row.crn, row.term_id);
            }
            if (currentTime - row["28d_timestamp"] >= interval28d) {
              const seat28d = JSON.parse(row.seat_28d) as number[];
              if (!seat28d) continue;
              seat28d.shift();
              seat28d.push(-1);
              db.prepare('UPDATE course_history SET seat_28d = ?, "28d_timestamp" = ? WHERE crn = ? AND term_id = ?').run(JSON.stringify(seat28d), currentTime, row.crn, row.term_id);
            }
            if (row.wait_24h !== null && row.wait_28d !== null) {
              if (currentTime - row["24h_timestamp"] >= interval24h) {
                const wait24h = JSON.parse(row.wait_24h) as number[];
                if (!wait24h) continue;
                wait24h.shift();
                wait24h.push(-1);
                db.prepare("UPDATE course_history SET wait_24h = ? WHERE crn = ? AND term_id = ?").run(JSON.stringify(wait24h), row.crn, row.term_id);
              }
              if (currentTime - row["7d_timestamp"] >= interval7d) {
                const wait7d = JSON.parse(row.wait_7d) as number[];
                if (!wait7d) continue;
                wait7d.shift();
                wait7d.push(-1);
                db.prepare("UPDATE course_history SET wait_7d = ? WHERE crn = ? AND term_id = ?").run(JSON.stringify(wait7d), row.crn, row.term_id);
              }
              if (currentTime - row["28d_timestamp"] >= interval28d) {
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
            term: c.term,
            waitCount: c.waitCount,
            waitCapacity: c.waitCapacity
          })
        );
        return classMap;
      })
    );

    const notificationsToSend = new Map<string, NotificationData[]>();
    const updateLastNotified = db.transaction((crn: string, ownerUuid: string, term: string) =>
      tryCatch(() => db.prepare("UPDATE watchers SET last_notified = ? WHERE crn = ? AND owner_uuid = ? AND term_id = ?").run(timeNow(), crn, ownerUuid, term))
    );
    for (const watcher of watchers) {
      if (!watcher.is_active) continue;
      if (watcher.last_notified && timeNow() - watcher.last_notified < ENV.NOTIFICATION_COOLDOWN) continue;

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
      const allSameTerm = availableClasses.every((c) => c.term === availableClasses[0].term);

      const components: Mutable<BaseMessageOptions["components"]> = [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: "alert",
              placeholder: "Disable a watcher",
              options: availableClasses.map((c) => ({
                label: `${allSameTerm ? "" : `(${getTermString(c.term)}) `}${c.subject} ${c.courseNumber} - ${c.sequenceNumber}`,
                value: `${c.term}:${c.courseReferenceNumber}:${c.subject}:${c.courseNumber}:${c.sequenceNumber}`
              }))
            }
          ]
        }
      ];
      if (ENV.FRONTEND_URL)
        components.push({
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              label: `Edit Watcher${availableClasses.length > 1 ? "s" : ""}`,
              style: 5,
              url: `${ENV.FRONTEND_URL}/watch`
            }
          ]
        });

      user?.send({
        embeds: [
          {
            title: `Watcher${availableClasses.length > 1 ? "s" : ""} Triggered`,
            description:
              availableClasses
                .map(
                  (c) =>
                    `- ${allSameTerm ? "" : `(${getTermString(c.term)}) `}**${c.subject} ${c.courseNumber} - ${c.sequenceNumber}** has ${c.notifyWhen! < 2 ? c.seatsAvailable : c.waitCount} ${c.notifyWhen! < 2 ? `seat${c.seatsAvailable === 1 ? "" : "s"} available` : `waitlist spot${c.waitCount === 1 ? "" : "s"} taken`}`
                )
                .join("\n") +
              `\nTh${availableClasses.length > 1 ? "ese" : "is"} watcher${availableClasses.length > 1 ? "s" : ""} will be able to notify you again <t:${timeNow() + ENV.NOTIFICATION_COOLDOWN}:R>`,
            color: ENV.PRIMARY_COLOR,
            timestamp: new Date().toISOString()
          }
        ],
        components
        // flags: availableClasses.every((c) => c.notification_priority === 0) ? MessageFlags.SuppressNotifications : undefined
      });
    }
  });
}
