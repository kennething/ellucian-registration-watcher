import { ClassSearchParams } from "../routes/class";
import { ClassData } from "./types";
import { Cookie } from "./cookie";

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

export async function searchClasses(term: string, params: Partial<ClassSearchParams>, offset = 0, isRetry = false, classes: ClassData[] = []): Promise<ClassData[]> {
  let url = `https://ssb.cc.binghamton.edu:8484/StudentRegistrationSsb/ssb/searchResults/searchResults?pageOffset=${offset}&pageMaxSize=500&txt_term=${term}&`;

  if (params.attribute?.length) url += `txt_attribute=${params.attribute.join(",")}&`;
  if (params.courseNumber) url += `txt_courseNumber=${params.courseNumber}&`;
  if (params.courseTitle) url += `txt_courseTitle=${params.courseTitle}&`;
  if (params.creditHours?.length === 2) url += `txt_credithourlow=${params.creditHours[0]}&txt_credithourhigh=${params.creditHours[1]}&`;
  if (params.crn) url += `txt_keywordany=${params.crn}&`;
  if (params.meetingDays?.length === 7)
    url += params.meetingDays
      .filter(Boolean)
      .map((_, i) => `chk_include_${i}=true&`)
      .join("");
  if (params.openSections) url += `chk_open_only=true&`;
  if (params.professor?.length) url += `txt_instructor=${params.professor.join(",")}&`;
  if (params.professorRating?.length === 2) url += ""; // TODO: todo
  if (params.subject?.length) url += `txt_subject=${params.subject.join(",")}&`;
  if (params.time?.length === 2) {
    const pad = (num: number) => String(num).padStart(2, "0");
    const startHour = params.time[0] % 60;
    const startMin = Math.floor(params.time[0] / 60);
    const endHour = params.time[1] % 60;
    const endMin = Math.floor(params.time[1] / 60);
    url += `select_start_hour=${pad(startHour)}&select_start_min=${pad(startMin)}&select_start_ampm=${startHour >= 12 ? "PM" : "AM"}&select_end_hour=${pad(endHour)}&select_end_min=${pad(endMin)}&select_end_ampm=${endHour >= 12 ? "PM" : "AM"}&`;
  }
  if (params.waitlistOpen) url += ""; // TODO: todo

  url = encodeURI(url.slice(0, -1)).replaceAll(",", "%2C");

  await Cookie.requestClient.post("https://ssb.cc.binghamton.edu:8484/StudentRegistrationSsb/ssb/classSearch/resetDataForm");
  const data = (await Cookie.requestClient.get<{ data: ClassData[] | null; totalCount: number }>(url)).data;

  if (data.data === null && !isRetry) {
    await Cookie.refreshCookie();
    return await searchClasses(term, params, offset, true, classes);
  } else if (data.data === null) return classes;

  classes.push(...data.data);
  if (data.totalCount > offset + 500) return await searchClasses(term, params, offset + 500, isRetry, classes);
  return classes;
}

/** Fetches the specified classes and automatically refreshes the cookie if needed */
export async function fetchClasses(term: string, crns: Set<string>): Promise<ClassData[]> {
  const uniqueCrns = Array.from(crns);
  const classes = await searchClasses(term, { crn: uniqueCrns.join(" OR ") });

  return classes;
}
