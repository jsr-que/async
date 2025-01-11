import { delay } from "@std/async";
import type { AsyncIterablePipe } from "./common.ts";
import { asyncIterableIteratorWithResolvers } from "./iterator.ts";

/**
 * Forks the source iterable into two branches.
 */
export const fork = <T, U>(
  branch: AsyncIterablePipe<T, U>,
): AsyncIterablePipe<T> =>
  async function* (source) {
    await using branchSource = asyncIterableIteratorWithResolvers<T>();

    branch(branchSource);

    for await (const value of source) {
      while (branchSource.backPressure > 5) {
        await delay(80);
      }

      branchSource.push(value);

      yield value;
    }

    branchSource.return();
  };
