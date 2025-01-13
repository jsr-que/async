import { delay } from "@std/async";
import type { Promisable } from "type-fest";
import { asyncIterableIteratorWithResolvers } from "./iterator.ts";
import type { AsyncIterablePipe } from "./pipe.ts";

/**
 * Options for creating a new RetryError.
 */
export interface RetryErrorOptions extends ErrorOptions {
  attempts: number;
}

/**
 * Error thrown when the maximum number of retries is exceeded.
 */
export class RetryError extends Error {
  constructor(message?: string, options?: RetryErrorOptions) {
    super(message, options);

    this.name = "RetryError";
    this.#attempts = options?.attempts ?? 0;
  }

  #attempts = 0;

  get attempts(): number {
    return this.#attempts;
  }
}

/**
 * Function that controls when and if a retry should be attempted.
 *
 * Hold on retrying with an internal delay, or return falsy values to stop
 * retrying.
 *
 * A `RetryError` will be thrown when retries are stopped.
 */
export type RetryHandler<T> = (
  attempt: number,
  error: Error,
  message: T,
) => Promisable<boolean | void>;

/**
 * Creates an exponential backoff function with jitter.
 */
export const exponentialBackoff = <T>({
  backoff,
  jitter = 0.3, // ±30%
  limit = 5,
}: {
  /**
   * Foreground tasks such as print queues should use a smaller exponent,
   * such as `2 ** Math.min(3, attempt)` retrying indefinitely.
   *
   * Background tasks should use a larger exponent to prevent network
   * saturation, such as `attempt ** 3` with a limit of 5.
   */
  backoff: number | ((attempt: number) => number);
  /**
   * Random jitter to prevent thundering herd problem.
   *
   * @default 0.3 // ±30%
   */
  jitter?: number;
  /**
   * Maximum number of attempts before giving up.
   *
   * @default 5
   */
  limit?: number;
}): RetryHandler<T> =>
async (attempt: number, error: Error, _: T) => {
  if (attempt > limit) {
    throw new RetryError(error.message, {
      cause: error,
      attempts: attempt - 1,
    });
  }

  await delay(
    ((typeof backoff === "function" ? backoff(attempt) : backoff) *
      (Math.random() * (jitter * 2) + (1 - jitter))) * 1000,
  );

  return true;
};

/**
 * Forwards the values of a provided async iterator with auto-retry.
 */
export const retry = <T>(
  target: (iterable: AsyncIterable<T>) => AsyncIteratorObject<T>,
  retryHandler: RetryHandler<T> = exponentialBackoff({
    backoff: (attempt) => attempt ** 3, // 1, 8, 27, 64, 125, 216, 343, 512, 729, 1000, ...
  }),
): AsyncIterablePipe<T> =>
  async function* (source) {
    let retrySource = asyncIterableIteratorWithResolvers<T>();
    let iterator = target(retrySource);
    let attempt = 0;

    for await (const event of source) {
      while (true) {
        try {
          retrySource.push(event);

          const { done, value } = await iterator.next();

          if (!done) {
            yield value;
          }

          break;
        } catch (e) {
          if (
            !(e instanceof Error) ||
            !await retryHandler(++attempt, e, event)
          ) {
            throw e;
          }

          retrySource = asyncIterableIteratorWithResolvers<T>();
          iterator = target(retrySource);
        }
      }

      attempt = 0;
    }
  };
