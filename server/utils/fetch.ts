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

/** Fetches the specified classes and automatically refreshes the cookie if needed */
export async function fetchClasses(term: string, crns: string[], isRetry = false): Promise<ClassData[] | undefined> {
  const data = (
    await Cookie.requestClient.get<{ data: ClassData[] | null }>(
      `https://ssb.cc.binghamton.edu:8484/StudentRegistrationSsb/ssb/searchResults/searchResults?pageOffset=0&pageMaxSize=100&txt_term=${term}&txt_keywordany=${crns.join("%20OR%20")}`
    )
  ).data;

  if (data.data === null && !isRetry) {
    await Cookie.refreshCookie();
    return fetchClasses(term, crns, true);
  } else if (data.data === null) return;

  return data.data;
}
