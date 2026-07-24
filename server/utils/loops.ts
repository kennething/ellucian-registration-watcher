import { ComponentType, MessageFlags } from "discord.js";
import { ClassData, NotificationType } from "./types";
import { fetchClasses, tryCatch } from "./fetch";
import { CLIENT } from "../../bot/src/common";
import { Cookie } from "./cookie";
import { db } from "./sqlite";

/** Waits for a specified interval and then calls the callback function
 * @param interval The interval in seconds at which to call the callback function. The first call will be aligned to the nearest interval.
 */
function waitForInterval(interval: number, callback: () => Promise<void>): void {
  const currentOffset = Math.ceil(Date.now() / 1000) % interval;
  setTimeout(() => setInterval(callback, interval * 1000), currentOffset * 1000);
}

/** Handles class watchers on a 10-minute interval */
export function watchClassesLoop(): void {
  type TruncatedClassData = {
    courseReferenceNumber: ClassData["courseReferenceNumber"];
    seatsAvailable: ClassData["seatsAvailable"];
    subject: ClassData["subject"];
    courseNumber: ClassData["courseNumber"];
    waitCount: ClassData["waitCount"];
    waitCapacity: ClassData["waitCapacity"];
  };

  const interval = 600 as const; // 10m interval

  // TODO: fix
  waitForInterval(interval, async () => {
    const mostRecentTerms = Cookie.getMostRecentTerms();
    if (!mostRecentTerms) return;

    const [watchers, error] = tryCatch<{ owner_uuid: string; term_id: string; crn: string; notification_priority: number; notify_when: NotificationType; notify_when_value: number }[]>(
      () =>
        db
          .prepare(`SELECT owner_uuid, term_id, crn, notification_priority, notify_when, notify_when_value FROM watchers WHERE term_id IN (${mostRecentTerms?.map(() => "?").join(", ")})`)
          .all(...mostRecentTerms) as any
    );
    if (error) return;

    console.log("loops l41 ", new Date().toLocaleString());

    const terms = Array.from(new Set(watchers.map((watcher) => watcher.term_id)));
    const classes = await Promise.all(
      terms.map(async (term) => {
        const data = await fetchClasses(term, new Set(watchers.filter((watcher) => watcher.term_id === term).map((watcher) => watcher.crn)));
        const classMap = new Map<string, TruncatedClassData>(); // Map<CRN, TruncatedClassData>

        data.forEach((c) =>
          classMap.set(c.courseReferenceNumber, {
            courseReferenceNumber: c.courseReferenceNumber,
            seatsAvailable: c.seatsAvailable,
            subject: c.subject,
            courseNumber: c.courseNumber,
            waitCount: c.waitCount,
            waitCapacity: c.waitCapacity
          })
        );
        return classMap;
      })
    );

    const notificationsToSend = new Map<string, (TruncatedClassData & { notification_priority: number })[]>();
    for (const watcher of watchers) {
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
        notificationsToSend
          .get(watcher.owner_uuid)
          ?.push({ ...classes[termIndex].get(watcher.crn), notification_priority: watcher.notification_priority } as TruncatedClassData & { notification_priority: number });
      }
    }

    for (const [uuid, availableClasses] of notificationsToSend) {
      const user = await CLIENT.client?.users.fetch(uuid);
      user?.send({
        embeds: [
          {
            title: `Class${availableClasses.length > 1 ? "es" : ""} Available!`,
            description: `${availableClasses.length > 1 ? availableClasses.length : "A"} class${availableClasses.length > 1 ? "es" : ""} you've been watching ${availableClasses.length > 1 ? "are" : "is"} now available:\n${availableClasses.map((c) => `- ${c.subject} ${c.courseNumber} - ${c.seatsAvailable} seats left`).join("\n")}`,
            color: 0x6befa2,
            timestamp: new Date().toISOString()
          }
        ],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.Button,
                label: `Remove Watcher${availableClasses.length > 1 ? "s" : ""}`,
                style: 5,
                url: `${process.env.FRONTEND_URL}/watch?delete=${encodeURIComponent(availableClasses.map((c) => c.courseReferenceNumber).join(","))}`
              }
            ]
          }
        ],
        flags: availableClasses.every((c) => c.notification_priority === 0) ? MessageFlags.SuppressNotifications : undefined
      });
    }
  });
}

/** Purges outdated watchers on a 24-hour interval */
export function purgeWatchersLoop(): void {
  const interval = 86400 as const; // 24h interval

  const termStrings = {
    "10": "Winter",
    "20": "Spring",
    "60": "Summer",
    "90": "Fall"
  } as const;

  const termsToDelete = new Map<string, number>(); // Map<termId, timestampToDelete>
  waitForInterval(interval, async () => {
    const mostRecentTerms = Cookie.getMostRecentTerms();
    if (!mostRecentTerms) return;
    const mostRecentTermStrings: `${(typeof termStrings)[keyof typeof termStrings]} ${number}`[] = mostRecentTerms.map(
      (term) => `${termStrings[term.slice(-2) as keyof typeof termStrings]} ${term.slice(0, -2)}`
    ) as any;

    if (termsToDelete.size) {
      for (const [termId, deleteTimestamp] of termsToDelete) {
        if (Date.now() >= deleteTimestamp * 1000) {
          db.prepare("DELETE FROM watchers WHERE term_id = ?").run(termId);
          termsToDelete.delete(termId);
        }
      }
      return;
    }

    const [allTerms, error] = tryCatch<{ term_id: string }[]>(db.prepare("SELECT DISTINCT term_id FROM watchers").all() as any);
    if (error) return;

    const outdatedTerms = allTerms.filter((term) => !mostRecentTerms.includes(term.term_id));
    outdatedTerms.forEach((term) => termsToDelete.set(term.term_id, Math.floor(Date.now() / 1000) + 7 * interval));
    if (!outdatedTerms.length) return;

    const [usersToNotify, error2] = tryCatch<{ owner_uuid: string }[]>(
      db.prepare(`SELECT DISTINCT owner_uuid FROM watchers WHERE term_id IN (${outdatedTerms.map(() => "?").join(",")})`).all(...outdatedTerms.map((term) => term.term_id)) as any
    );
    if (error2) return;

    for (const user of usersToNotify) {
      const discordUser = await CLIENT.client?.users.fetch(user.owner_uuid);
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
  });
}
