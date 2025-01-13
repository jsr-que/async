import { MuxAsyncIterator } from "@std/async";
import { asyncIterableIteratorWithResolvers } from "./iterator.ts";
import type { AsyncIterablePipe } from "./pipe.ts";

/**
 * Forks the source iterable into two branches.
 */
export const fork = <T, U>(
  branch: AsyncIterablePipe<T, U>,
): AsyncIterablePipe<T, T | U> =>
  async function* (iterable) {
    await using branchIt = asyncIterableIteratorWithResolvers<T>();
    await using masterIt = asyncIterableIteratorWithResolvers<T>();

    (async () => {
      for await (const value of iterable) {
        branchIt.push(value);
        masterIt.push(value);
      }

      await Promise.allSettled([
        branchIt.return(undefined, false),
        masterIt.return(undefined, false),
      ]);
    })();

    const mux = new MuxAsyncIterator<T | U>();

    mux.add(masterIt);
    mux.add(branch(branchIt));

    yield* mux;
  };
