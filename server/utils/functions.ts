import { ClassData, TruncatedClassData } from "./types";
import { tryCatch } from "./fetch";
import { timeNow } from "./time";
import { db } from "./sqlite";
import { Log } from "./log";

/** Waits for a specified interval and then calls the callback function
 * @param interval The interval in seconds at which to call the callback function. The first call will be aligned to the nearest interval.
 *
 * Set to `0` to not run. Set to `-1` to run once, immediately.
 * @param offset offset in seconds.
 */
export function waitForInterval(interval: number, offset: number, callback: () => Promise<void>): void {
  if (interval === -1) return void callback();
  if (interval === 0) return;

  const timeUntilInterval = interval - (timeNow() % interval);

  setTimeout(
    () => {
      callback();
      setInterval(callback, interval * 1000);
    },
    (timeUntilInterval + offset) * 1000
  );
}

/** Deserializes a `snake_case` object to `camelCase`.
 */
export function toCamelCase(obj: object): object {
  if (Array.isArray(obj)) return obj.map((item) => (typeof item === "object" && item !== null ? toCamelCase(item) : item));

  const camelCaseData: object = {};

  for (const key in obj) {
    const value = obj[key as keyof typeof obj];
    const camelCaseKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

    // @ts-expect-error
    camelCaseData[camelCaseKey] = typeof value === "object" && value !== null && !Array.isArray(value) ? toCamelCase(value) : value;
  }
  return camelCaseData;
}

const terms = {
  "10": "Winter",
  "20": "Spring",
  "60": "Summer",
  "90": "Fall"
} as const;
export function getTermString(term: string) {
  const year = term.slice(0, 4);
  const quarter = term.slice(4);
  return `${terms[quarter as keyof typeof terms]} ${year}`;
}

export function getMeetingTimeString(meetingTime: TruncatedClassData["meeting"]["time"]) {
  if (!meetingTime[0] || !meetingTime[1]) return "TBD";

  const startTime = Number(meetingTime[0]);
  const startHour = Number(meetingTime[0].slice(0, 2));
  const endTime = Number(meetingTime[1]);
  const endHour = Number(meetingTime[1].slice(0, 2));
  const sameAmpm = Math.floor(startTime / 1200) === Math.floor(endTime / 1200);

  let startStr = `${startHour > 12 ? startHour - 12 : startHour}:${meetingTime[0].slice(2)}`;
  if (!sameAmpm) startStr += startTime < 1200 ? " AM" : " PM";
  return `${startStr} - ${endHour > 12 ? endHour - 12 : endHour}:${meetingTime[1].slice(2)} ${endTime < 1200 ? "AM" : "PM"}`;
}

export function getMeetingDaysString(meetingDays?: TruncatedClassData["meeting"]["days"]) {
  const days = ["Su", "M", "T", "W", "Th", "F", "Sa"];
  return (
    meetingDays
      ?.map((day, i) => (day ? days[i] : ""))
      .filter(Boolean)
      .join("") ?? ""
  );
}

export function truncateClassData(data: ClassData[]): Map<string, TruncatedClassData> {
  const classMap = new Map<string, TruncatedClassData>(); // Map<CRN, TruncatedClassData>
  data.forEach((c) => {
    const professor = c.faculty.find((f) => f.primaryIndicator);
    const [rmpData, error] = professor
      ? tryCatch<{ rmp_id: number; overall_rating: number; num_ratings: number; percent_take_again: number; level_of_difficulty: number }>(
          () => db.prepare("SELECT rmp_id, overall_rating, num_ratings, percent_take_again, level_of_difficulty FROM professors WHERE school_name = ? LIMIT 1").get(professor.displayName) as any
        )
      : [];
    if (error) return Log.error(error);

    const [history, error2] = tryCatch<{
      "24h_timestamp": number;
      seat_24h: string;
      seat_7d: string;
      seat_28d: string;
      wait_24h: string | null;
      wait_7d: string | null;
      wait_28d: string | null;
    }>(
      () => db.prepare('SELECT "24h_timestamp", seat_24h, seat_7d, seat_28d, wait_24h, wait_7d, wait_28d FROM course_history WHERE term_id = ? AND crn = ?').get(c.term, c.courseReferenceNumber) as any
    );
    if (error2) return Log.error(error2);

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
      seat7d: history ? JSON.parse(history.seat_7d) : null,
      seat28d: history ? JSON.parse(history.seat_28d) : null,
      wait24h: history?.wait_24h ? JSON.parse(history.wait_24h) : null,
      wait7d: history?.wait_7d ? JSON.parse(history.wait_7d) : null,
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
}

// * random chatgpt go
/**
 * Hashes a string using 32-bit MurmurHash3.
 * Returns an unsigned 32-bit integer.
 */
function murmurHash3(key: string, seed = 0): number {
  let h1 = seed >>> 0;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;

  const len = key.length;
  let i = 0;

  while (i < len) {
    // Read 16-bit code units (sufficient for general strings/ASCII)
    let k1 = key.charCodeAt(i++);

    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (Math.imul(h1, 5) + 0xe6546b64) >>> 0;
  }

  // Final avalanche step to ensure bit diffusion
  h1 ^= len;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;

  return h1 >>> 0; // Return unsigned 32-bit integer
}

/**
 * Hashes an input string into an integer within [0, range - 1],
 * then groups the result into upper-bound bucket blocks.
 *
 * @param input The string to hash.
 * @param range The upper bound limit (exclusive), mapping to 0 to range - 1.
 * @param blockSize The size of the bucket/block. Values in [0, blockSize - 1] map to (blockSize - 1).
 * @returns The final bucketed integer.
 */
export function hashToRange(input: string, range: number, blockSize: number): number {
  if (range <= 0 || !Number.isInteger(range)) {
    throw new RangeError("`range` must be a positive integer.");
  }
  if (blockSize <= 0 || !Number.isInteger(blockSize)) {
    throw new RangeError("`blockSize` must be a positive integer.");
  }

  // 1. Compute deterministic hash and map across [0, range - 1]
  const rawHash = murmurHash3(input);
  const rawIndex = rawHash % range;

  // 2. Map to the end of the block: Math.floor(rawIndex / blockSize) * blockSize + (blockSize - 1)
  const blockStart = Math.floor(rawIndex / blockSize) * blockSize;
  const blockUpperTarget = blockStart + (blockSize - 1);

  // 3. Clamp to range - 1 to handle edge blocks when range is not divisible by blockSize
  return Math.min(blockUpperTarget, range - 1);
}
