import { createDeferredIterable } from "./deferred-iterable.ts";

export const fork = <T, U>(
  branch: (iterable: Iterable<T> | AsyncIterable<T>) => U,
) =>
  async function* (source: Iterable<T> | AsyncIterable<T>) {
    const branchSource = createDeferredIterable<T>();

    branch(branchSource);

    for await (const value of source) {
      // FIXME: pipe feeding with no backpressure
      branchSource.push(value);

      yield value;
    }

    branchSource.return();
  };
