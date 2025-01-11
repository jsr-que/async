/** Indicates the iterator is still in active state. */
const activeSymbol = Symbol();

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
  return: NonNullable<AsyncIterator<T, TReturn, TNext>["return"]>;
}

/**
 * Options for async iterator with resolvers.
 */
export interface AsyncIteratorWithResolversOptions {
  readonly dispose?: () => void | Promise<void>;
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
  const frontPressure: PromiseWithResolvers<T>[] = [];
  const backPressure: Promise<T>[] = [];
  let returnValue: TReturn | undefined | symbol = activeSymbol;

  return {
    async [Symbol.asyncDispose]() {
      await this.return();
      await options?.dispose?.();
    },
    async return(value) {
      if (returnValue === activeSymbol) {
        returnValue = await value;

        for (const deferred of frontPressure) {
          deferred.resolve(undefined as never);
        }

        frontPressure.length = 0;

        // compat for runtimes without `await using`
        // 1. Users must call return() manually
        // 2. 100ms should be enough for multiple macrotasks
        if (options?.dispose && !("asyncDispose" in Symbol)) {
          setTimeout(() => options?.dispose?.(), 100);
        }
      }

      return { done: true, value: returnValue as TReturn };
    },
    async next() {
      if (backPressure.length > 0) {
        return { done: false, value: await backPressure.shift()! };
      }

      if (returnValue !== activeSymbol) {
        return { done: true, value: returnValue as TReturn };
      }

      // This allows multiple pending .next() without awaiting the previous one.
      // `for await ... of` doesn't do that, but possible manually.
      const deferred = Promise.withResolvers<T>();

      frontPressure.push(deferred);

      const value = await deferred.promise;

      // Happens when return() is called while waiting for value
      if (returnValue !== activeSymbol) {
        return { done: true, value: returnValue as TReturn };
      }

      return { done: false, value: value };
    },
    push(value: T | Promise<T>) {
      if (returnValue !== activeSymbol) {
        return;
      }

      if (frontPressure.length > 0) {
        frontPressure.shift()!
          .resolve(value);
      } else {
        backPressure.push(
          Promise.resolve(value),
        );
      }
    },
    get active() {
      return returnValue === activeSymbol;
    },
    get backPressure() {
      return backPressure.length;
    },
    get frontPressure() {
      return frontPressure.length;
    },
  };
};

/**
 * Async iterable iterator with manual resolvers exposed.
 */
export interface AsyncIterableIteratorWithResolvers<
  T,
  TReturn = unknown,
  TNext = unknown,
> extends AsyncIteratorWithResolvers<T, TReturn, TNext> {
  [Symbol.asyncIterator](): AsyncIterableIteratorWithResolvers<
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
): AsyncIterableIteratorWithResolvers<T, TReturn, TNext> => {
  const iterator = asyncIteratorWithResolvers<T, TReturn, TNext>(options);

  return {
    ...iterator,
    [Symbol.asyncIterator]() {
      return this;
    },
  };
};
