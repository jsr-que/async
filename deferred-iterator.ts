/** Indicates the iterator is still in active state. */
const activeSymbol = Symbol();

export interface DeferredIterator<
  T,
  TReturn = unknown,
  TNext = unknown,
> extends AsyncIterator<T, TReturn, TNext>, AsyncDisposable {
  readonly active: boolean;
  readonly backPressure: number;
  readonly frontPressure: number;
  push: (value: T | Promise<T>) => void;
  return: NonNullable<AsyncIterator<T, TReturn, TNext>["return"]>;
}

export interface DeferredIteratorOptions {
  readonly dispose?: () => void | Promise<void>;
}

export const createDeferredIterator = <
  T,
  TReturn = unknown,
  TNext = unknown,
>(options?: DeferredIteratorOptions): DeferredIterator<T, TReturn, TNext> => {
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
