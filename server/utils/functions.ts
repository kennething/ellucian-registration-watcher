import { Failure, Result, Success } from "./fetch";

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
