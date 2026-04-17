import { Cookie } from "./playwright";
import { ClassData } from "./types";

type Success<T> = [data: T, error: never];
type Failure<E> = [data: never, error: E];
export type Result<T, E = Error> = Success<T> | Failure<E>;

/** Implements try/catch for a given promise.
 *
 * If the promise resolves, returns an object with a `data` property. If the promise rejects, returns an object with an `error` property.
 * @template T the type of data to return if the promise resolves successfully.
 * @template E the type of error to return. Defaults to `Error`.
 * @param promise the promise to implement try/catch for.
 * @example
 * const { data, error } = await tryCatch(getData());
 * if (error) return; // handle the error
 * doSomething(data); // data can now be used
 */
async function tryCatch<T, E = Error>(promise: Promise<T>): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return [data, undefined] as Success<T>;
  } catch (error) {
    return [undefined, error as E] as Failure<E>;
  }
}

/** Makes a request to the given url with the given method and body.
 * @param url the url to request.
 * @param method the HTTP method to use for the request. Defaults to `"GET"`.
 * @param body the body of the request as an object.
 */
async function requestUrl(url: string, method?: string, body?: object): Promise<void>;
/** Makes a request to the given url with the given method and body.
 * @template T the type of the request's response
 * @param url the url to request.
 * @param method the HTTP method to use for the request. Defaults to `"GET"`.
 * @param body the body of the request as an object.
 * @returns the JSON response from the request.
 */
async function requestUrl<T>(url: string, method?: string, body?: object): Promise<T>;
async function requestUrl<T>(url: string, method?: string, body?: object): Promise<T | void> {
  const options: RequestInit = {};
  if (method) options.method = method;

  if (body) {
    if (body instanceof FormData) options.body = body;
    else {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }
  }

  options.headers = { ...options.headers, Cookie: (await Cookie.getCookie()) ?? "" };

  const res = await fetch(url, options);
  if (!res.ok) throw new Error(res.statusText);

  const contentLength = res.headers.get("Content-Length");
  if (contentLength === "0") return undefined as T;

  try {
    const data = await res.json();
    return data as T;
  } catch (e) {
    return undefined as T;
  }
}

/** **Serves as a wrapper for `tryCatch(requestUrl())`.**
 * @param url the url to request. It will be automatically appended to the base URL, **so it SHOULD start with a `/`**.
 * @param method the HTTP method to use for the request. Defaults to `"GET"`.
 * @param body the body of the request as an object.
 */
export async function fetchUrl(url: string, method?: string, body?: object): Promise<Result<void>>;
/** **Serves as a wrapper for `tryCatch(requestUrl())`.**
 * @template T the type of the request's response
 * @template K the type of error to return. Defaults to `Error`.
 * @param url the url to request. It will be automatically appended to the base URL, **so it SHOULD start with a `/`**.
 * @param method the HTTP method to use for the request. Defaults to `"GET"`.
 * @param body the body of the request as an object.
 * @returns the JSON response from the request.
 */
export async function fetchUrl<T, K = Error>(url: string, method?: string, body?: object): Promise<Result<T, K>>;
export async function fetchUrl<T, K = Error>(url: string, method?: string, body?: object): Promise<Result<T | void, K>> {
  return tryCatch<T, K>(requestUrl<T>(url, method, body));
}

/** Fetches the specified classes and automatically refreshes the cookie if needed */
export async function fetchClasses(term: string, crns: string[], isRetry = false): Promise<ClassData[] | undefined> {
  const [data, error] = await fetchUrl<{ data: ClassData[] | null }>(
    `https://ssb.cc.binghamton.edu:8484/StudentRegistrationSsb/ssb/searchResults/searchResults?pageOffset=0&pageMaxSize=100&txt_term=${term}&txt_keywordany=${crns.join("%20OR%20")}`
  );
  if (error) return;

  if (data.data === null && !isRetry) {
    await Cookie.getCookie(true);
    return fetchClasses(term, crns, true);
  } else if (data.data === null) return;

  return data.data;
}
