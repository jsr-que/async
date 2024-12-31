/** Indicates the iterator is still in active state. */
const activeSymbol = Symbol();

export interface DeferredIterator<
  T,
  TReturn = any,
  TNext = any,
> extends AsyncIterator<T, TReturn, TNext> {
  readonly active: boolean;
  push: (value: T | Promise<T>) => void;
  return: NonNullable<AsyncIterator<T, TReturn, TNext>["return"]>;
}

export const createDeferredIterator = <
  T,
  TReturn = any,
  TNext = any,
>(): DeferredIterator<T, TReturn, TNext> => {
  const frontPressure: PromiseWithResolvers<T>[] = [];
  const backPressure: Promise<T>[] = [];
  let returnValue: TReturn | undefined | symbol = activeSymbol;

  return {
    async return(value) {
      if (returnValue === activeSymbol) {
        returnValue = await value;

        for (const deferred of frontPressure) {
          deferred.resolve(undefined as never);
        }

        frontPressure.length = 0;
      }

      return { done: true, value: returnValue as TReturn };
    },
    async next() {
      if (backPressure.length > 0) {
        return { done: false, value: await backPressure.shift()! };
      }

      if (typeof returnValue !== "symbol") {
        return { done: true, value: returnValue! };
      }

      const deferred = Promise.withResolvers<T>();

      frontPressure.push(deferred);

      const value = await deferred.promise;

      // If return() is called while waiting for a value
      if (typeof returnValue !== "symbol") {
        return { done: true, value: returnValue! };
      } else {
        return { done: false, value: value };
      }
    },
    push(value: T | Promise<T>) {
      if (typeof returnValue !== "symbol") {
        return;
      }

      if (frontPressure.length > 0) {
        frontPressure.shift()!.resolve(
          value,
        );
      } else {
        backPressure.push(
          Promise.resolve(value),
        );
      }
    },
    get active() {
      return returnValue === activeSymbol;
    },
  };
};
