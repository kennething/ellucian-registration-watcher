import { ClassSearchParams } from "../routes/class";
import { ClassData } from "./types";
import { Cookie } from "./cookie";
import { db } from "./sqlite";
import ENV from "../../env";

export type Success<T> = [data: T, error: never];
export type Failure<E> = [data: never, error: E];
export type Result<T, E = Error> = Success<T> | Failure<E>;

/** Implements try/catch for a given function.
 *
 * If the function executes successfully, returns an object with a `data` property. If the function throws an error, returns an object with an `error` property.
 * @template T the type of data to return if the function executes successfully.
 * @template E the type of error to return. Defaults to `Error`.
 * @param fn the function to implement try/catch for.
 * @example
 * const [data, error] = tryCatch(getData);
 * if (error) return; // handle the error
 * doSomething(data); // data can now be used
 */
export function tryCatch<T, E = Error>(fn: () => T): Result<T, E> {
  try {
    const data = fn();
    return [data, undefined] as Success<T>;
  } catch (error) {
    return [undefined, error as E] as Failure<E>;
  }
}

export class AsyncQueue {
  private currentTask: Promise<void | any>;

  constructor() {
    this.currentTask = Promise.resolve();
  }

  enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const taskCompletion = this.currentTask.then(() => task());
    this.currentTask = taskCompletion.catch(() => {});

    return taskCompletion;
  }
}
const requestQueue = new AsyncQueue();

/** @param params !! does not handle `professorRating` */
async function searchClasses(term: string, params: Partial<ClassSearchParams>, offset = 0, limit = 500, isRetry = false, classes: ClassData[] = []): Promise<[classes: ClassData[], total: number]> {
  limit = Math.min(limit, 500);
  let url = `${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/searchResults/searchResults?pageOffset=${offset}&pageMaxSize=${limit}&txt_term=${term}&`;

  if (params.attribute?.length) url += `txt_attribute=${params.attribute}&`;
  if (params.courseNumber) url += `txt_courseNumber=${params.courseNumber}&`;
  if (params.courseTitle) url += `txt_courseTitle=${encodeURIComponent(`%${params.courseTitle}%`)}&`;
  if (params.creditHours?.length === 2) url += `txt_credithourlow=${params.creditHours[0]}&txt_credithourhigh=${params.creditHours[1]}&`;
  if (params.crn) url += `txt_keywordany=${params.crn}&`;
  if (params.meetingDays?.length === 7)
    url += params.meetingDays
      .map((val, i) => (val ? `chk_include_${i}=true&` : null))
      .filter(Boolean)
      .join("");
  // // if (params.openSections) url += `chk_open_only=true&`;
  // // if (params.professor?.length) url += `txt_instructor=${params.professor.join(",")}&`;
  if (params.subject?.length) url += `txt_subject=${params.subject}&`;
  if (params.time?.length === 6) {
    const pad = (num: number) => String(num).padStart(2, "0");
    if (params.time[0] !== null && params.time[1] !== null) url += `select_start_hour=${pad(params.time[0])}&select_start_min=${pad(params.time[1])}&select_start_ampm=${params.time[2]}&`;
    if (params.time[3] !== null && params.time[4] !== null) url += `select_end_hour=${pad(params.time[3])}&select_end_min=${pad(params.time[4])}&select_end_ampm=${params.time[5]}&`;
  }
  // // if (params.waitlistOpen) url += ""; // TODO: todo

  url = encodeURI(url.slice(0, -1)).replaceAll(",", "%2C");

  await Cookie.requestClient.post(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/resetDataForm`);
  const data = (await Cookie.requestClient.get<{ data: ClassData[] | null; totalCount: number }>(url)).data;

  if (data.data === null && !isRetry) {
    await Cookie.refreshCookie();
    return await searchClasses(term, params, offset, limit, true, classes);
  } else if (data.data === null) return [classes, data.totalCount];

  const dataData = data.data.map((c) => {
    if (c.subject !== "MATH" || c.faculty.length !== 0) return c;

    try {
      const professor = (db.prepare(`SELECT professor FROM "${term}_math_schedule" WHERE crn = ?`).get(c.courseReferenceNumber) as { professor: string } | undefined)?.professor;
      if (!professor) return c;

      return {
        ...c,
        faculty: [
          {
            professorLeaked: true,
            term: c.term,
            bannerId: "",
            category: null,
            class: "",
            courseReferenceNumber: c.courseReferenceNumber,
            displayName: professor,
            emailAddress: "",
            primaryIndicator: true
          }
        ]
      };
    } catch (error) {
      return c;
    }
  });

  classes.push(...dataData);
  if (limit === 500 && data.totalCount > offset + limit) return await searchClasses(term, params, offset + limit, limit, isRetry, classes);
  return [classes, data.totalCount];
}

export async function requestSearchClasses(term: string, params: Partial<ClassSearchParams>, offset = 0, limit = 500, isRetry = false, classes: ClassData[] = []) {
  return requestQueue.enqueue(() => searchClasses(term, params, offset, limit, isRetry, classes));
}

/** Fetches the specified classes and automatically refreshes the cookie if needed */
export async function fetchClasses(term: string, crns: Set<string>): Promise<ClassData[]> {
  const uniqueCrns = Array.from(crns);
  const classes = await requestSearchClasses(term, { crn: uniqueCrns.join(" OR ") });

  return classes[0];
}
