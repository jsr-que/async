import { delay } from "@std/async";
import { assertEquals } from "jsr:@std/assert@0.224";
import { createDeferredIterable } from "./deferred-iterable.ts";

Deno.test("should iterate values", async () => {
  await using iter = createDeferredIterable<number>();
  const result: unknown[] = [];

  const promise = (async () => {
    iter.push(1);
    await delay(0);
    iter.push(2);
    iter.push(3);
    await delay(0);
    iter.push(4);
    iter.return();
  })();

  for await (const value of iter) {
    result.push(value);
  }

  await promise;

  assertEquals(result, [1, 2, 3, 4]);
});

Deno.test("should allow break outs", async () => {
  await using iter = createDeferredIterable<number>();
  const result: unknown[] = [];

  const promise = (async () => {
    iter.push(1);
    await delay(0);
    iter.push(2);
    iter.push(3);
    await delay(0);
    iter.push(4);
    iter.return();
  })();

  for await (const value of iter) {
    result.push(value);
    if (value >= 3) break;
  }

  await promise;

  assertEquals(result, [1, 2, 3]);
});

Deno.test(
  "should allow concurrent .next() and multiple .return()",
  async () => {
    await using iter = createDeferredIterable<number>();

    const promise = (async () => {
      iter.push(1);
      await delay(0);
      iter.push(2);
      iter.push(3);
      iter.return();
      iter.return();
      await delay(0);
      iter.return();
      iter.push(4);
    })();

    const result = await Promise.all([
      iter.next().then(({ value }) => value),
      iter.next().then(({ value }) => value),
      iter.next().then(({ value }) => value),
      iter.next().then(({ value }) => value),
    ]);

    await promise;

    assertEquals(result, [1, 2, 3, undefined]);
  },
);
