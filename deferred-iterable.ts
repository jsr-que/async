import {
  createDeferredIterator,
  type DeferredIterator,
} from "./deferred-iterator.ts";

interface DeferredIterableIterator<
  T,
  TReturn = any,
  TNext = any,
> extends DeferredIterator<T, TReturn, TNext> {
  [Symbol.asyncIterator](): DeferredIterableIterator<T, TReturn, TNext>;
}

export const createDeferredIterable = <
  T,
  TReturn = any,
  TNext = any,
>(): DeferredIterableIterator<T, TReturn, TNext> => {
  const iterator = createDeferredIterator<T>();

  return {
    [Symbol.asyncIterator]() {
      return this;
    },
    ...iterator,
  };
};
