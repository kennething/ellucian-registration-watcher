import { DateTime } from "luxon";
import ENV from "../../env";

export function timeNow(getDateTime: true): DateTime;
export function timeNow(getDateTime?: false): number;
export function timeNow(getDateTime = false) {
  const dateTime = DateTime.now().setZone(ENV.TIMEZONE);

  if (getDateTime) return dateTime;
  return dateTime.toUnixInteger();
}
