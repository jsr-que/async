import { MuxAsyncIterator } from "@std/async";
import type { AsyncIterablePipe } from "./common.ts";
import { asyncIterableIteratorWithResolvers } from "./iterator.ts";

/**
 * Branches an iterator value when the value passes the provided filter
 * function, otherwise bypass the branch and yield.
 */
export const triage = <T>(
  filter: (event: T, index: number) => boolean | Promise<boolean>,
  branch: AsyncIterablePipe<T>,
): AsyncIterablePipe<T> =>
  async function* (iterable) {
    await using branchIt = asyncIterableIteratorWithResolvers<T>();
    await using masterIt = asyncIterableIteratorWithResolvers<T>();

    (async () => {
      let index = 0;
      for await (const value of iterable) {
        if (await filter(value, index++)) {
          branchIt.push(value);
        } else {
          masterIt.push(value);
        }
      }

      branchIt.return();
      masterIt.return();
    })();

    const mux = new MuxAsyncIterator<T>();

    mux.add(masterIt);
    mux.add(branch(branchIt));

    yield* mux;
  };
