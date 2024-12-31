import { pipe } from "jsr:@core/pipe";
import { assertEquals } from "jsr:@std/assert";
import { exponentialBackoff, retry } from "./retry.ts";

Deno.test("retry", async () => {
  const results: unknown[] = [];

  let invokes = 0;
  async function* foo(iterator: AsyncIterable<number>) {
    for await (const value of iterator) {
      if (invokes++ < 2) {
        results.push("retry");
        throw new Error("retry");
      }

      yield value;
    }
  }

  async function* numbers() {
    yield 1;
    yield 2;
    yield 3;
  }

  for await (
    const value of pipe(
      numbers(),
      retry(
        foo,
        exponentialBackoff({
          backoff: (n) => 2 ** Math.min(n, 3) / 10,
          limit: 3,
        }),
      ),
    )
  ) results.push(value);

  assertEquals(results, ["retry", "retry", 1, 2, 3]);
});
