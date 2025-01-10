import { delay } from "@std/async";
import { createDeferredIterable } from "./deferred-iterable.ts";

export const fork = <T, U>(
  branch: (iterable: Iterable<T> | AsyncIterable<T>) => U,
) =>
  async function* (source: Iterable<T> | AsyncIterable<T>) {
    await using branchSource = createDeferredIterable<T>();

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
