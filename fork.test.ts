import { pooledMap } from "@std/async";
import { pipe } from "jsr:@core/pipe";
import { assertEquals } from "jsr:@std/assert";
import { fork } from "./fork.ts";

pooledMap;

Deno.test("fork", async () => {
  const branchResults: number[] = [];
  const master = pipe(
    [1, 2, 3],
    fork(
      async function* (iterable) {
        for await (const number of iterable) {
          branchResults.push(number * 2);
        }
      },
    ),
  );

  assertEquals(await Array.fromAsync(master), [1, 2, 3]);
  assertEquals(branchResults, [2, 4, 6]);
});
