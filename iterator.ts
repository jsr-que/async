import { Queue } from "@core/asyncutil/queue";
import { delay } from "@std/async";
import type { Promisable } from "type-fest";

/** Indicates the iterator is still in active state. */
const returnSymbol = Symbol.for("AsyncIterator.return");

/**
 * Async iterator with manual resolvers exposed.
 *
 * The Promise.withResolvers counterpart for async iterators.
 */
export interface AsyncIteratorWithResolvers<
  T,
  TReturn = unknown,
  TNext = unknown,
> extends AsyncIterator<T, TReturn, TNext>, AsyncDisposable {
  /** Indicates the iterator is not closed by return(). */
  readonly active: boolean;
  /** Number of values waiting to be consumed via .push(). */
  readonly backPressure: number;
  /** Number of consumers waiting for values via .next(). */
  readonly frontPressure: number;
  /** Push a value to the iterator. */
  push: (value: T | Promise<T>) => void;
  /** Close the iterator. */
  return(
    value?: Promisable<TReturn>,
    /**
     * Drop pending values in the queue, specify false to let the iterator
     * finish gracefully.
     *
     * @default true
     */
    force?: boolean,
  ): Promise<IteratorResult<T, TReturn>>;
}

/**
 * Options for async iterator with resolvers.
 */
export interface AsyncIteratorWithResolversOptions {
  readonly dispose?: () => Promisable<void>;
}

/**
 * Create an async iterator for deferred iterator.
 */
export const asyncIteratorWithResolvers = <
  T,
  TReturn = unknown,
  TNext = unknown,
>(
  options?: AsyncIteratorWithResolversOptions,
): AsyncIteratorWithResolvers<T, TReturn, TNext> => {
  const queue = new Queue<Promise<T> | typeof returnSymbol>();

  let frontPressure = 0;

  let returnPromise: Promisable<TReturn> | undefined;

  return {
    async [Symbol.asyncDispose]() {
      await this.return();
      await options?.dispose?.();
    },
    async return(value, force = true) {
      if (returnPromise === undefined) {
        returnPromise = Promise.resolve(value as Promisable<TReturn>);

        // Release pending consumers
        while (queue.locked) {
          queue.push(returnSymbol);
        }

        // Clear pending values
        while (queue.size > 0) {
          if (!force) {
            await delay(100);
          } else {
            await queue.pop();
          }
        }

        // compat for runtimes without `await using`
        // 1. Users must call return() manually
        // 2. 100ms should be enough for multiple macrotasks
        if (options?.dispose && !("asyncDispose" in Symbol)) {
          setTimeout(() => options?.dispose?.(), 100);
        }
      }

      return { done: true, value: await returnPromise };
    },
    async next() {
      if (returnPromise !== undefined && queue.size === 0) {
        return { done: true, value: await returnPromise };
      }

      frontPressure++;

      const value = await queue.pop();

      frontPressure--;

      if (value === returnSymbol) {
        return { done: true, value: await returnPromise! };
      }

      return { done: false, value: value };
    },
    push(value: T | Promise<T>) {
      if (value instanceof Promise) {
        queue.push(value);
      } else {
        queue.push(Promise.resolve(value));
      }
    },
    get active() {
      return returnPromise === undefined;
    },
    get backPressure() {
      return queue.size;
    },
    get frontPressure() {
      return frontPressure;
    },
  };
};

/**
 * Async iterable iterator with manual resolvers exposed.
 */
export interface AsyncIterableWithResolvers<
  T,
  TReturn = unknown,
  TNext = unknown,
> extends AsyncIteratorWithResolvers<T, TReturn, TNext> {
  [Symbol.asyncIterator](): AsyncIteratorWithResolvers<
    T,
    TReturn,
    TNext
  >;
}

/**
 * Create an async iterator for deferred iterable.
 *
 * Manually push values to the iterator and closes it when done.
 */
export const asyncIterableIteratorWithResolvers = <
  T,
  TReturn = unknown,
  TNext = unknown,
>(
  options?: AsyncIteratorWithResolversOptions,
): AsyncIterableWithResolvers<T, TReturn, TNext> => {
  const iterator = asyncIteratorWithResolvers<T, TReturn, TNext>(options);

  return {
    ...iterator,
    [Symbol.asyncIterator]() {
      return this;
    },
  };
};
