import { MuxAsyncIterator } from "@std/async";
import { createDeferredIterable } from "./deferred-iterable.ts";

export const triage = <T>(
  filter: (event: T, index: number) => boolean | Promise<boolean>,
  branch: (iterable: Iterable<T> | AsyncIterable<T>) => AsyncIterable<T>,
): (it: Iterable<T> | AsyncIterable<T>) => AsyncGenerator<T> =>
  async function* (iterable) {
    await using branchIt = createDeferredIterable<T>();
    await using masterIt = createDeferredIterable<T>();

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
