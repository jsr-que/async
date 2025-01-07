import {
  createDeferredIterator,
  type DeferredIterator,
  type DeferredIteratorOptions,
} from "./deferred-iterator.ts";

interface DeferredIterableIterator<
  T,
  TReturn = unknown,
  TNext = unknown,
> extends DeferredIterator<T, TReturn, TNext> {
  [Symbol.asyncIterator](): DeferredIterableIterator<T, TReturn, TNext>;
}

export const createDeferredIterable = <
  T,
  TReturn = unknown,
  TNext = unknown,
>(
  options?: DeferredIteratorOptions,
): DeferredIterableIterator<T, TReturn, TNext> => {
  const iterator = createDeferredIterator<T, TReturn, TNext>(options);

  return {
    ...iterator,
    [Symbol.asyncIterator]() {
      return this;
    },
  };
};
