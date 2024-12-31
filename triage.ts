import { MuxAsyncIterator } from "@std/async";
import { createDeferredIterable } from "./deferred-iterable.ts";

export const triage = <T>(
  filter: (event: T, index: number) => boolean | Promise<boolean>,
  branch: (iterable: Iterable<T> | AsyncIterable<T>) => AsyncIterable<T>,
) =>
  async function* (iterable: AsyncIterable<T>) {
    const branchIt = createDeferredIterable<T>();
    const masterIt = createDeferredIterable<T>();

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

    const mux = new MuxAsyncIterator();

    mux.add(masterIt);
    mux.add(branch(branchIt));

    for await (const value of mux) {
      yield value;
    }
  };
