import { TruncatedClassData } from "./types";

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

export function getMeetingDaysString(meetingDays: TruncatedClassData["meeting"]["days"]) {
  const days = ["Su", "M", "T", "W", "Th", "F", "Sa"];
  return meetingDays
    .map((day, i) => (day ? days[i] : ""))
    .filter(Boolean)
    .join("");
}
