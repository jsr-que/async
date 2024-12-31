import { map } from "jsr:@core/iterutil/pipe/async/map";
import { pipe } from "jsr:@core/pipe";
import { assertEquals } from "jsr:@std/assert";
import { triage } from "./triage.ts";

Deno.test("should triage to branch when conditions are met", async () => {
  const stream = pipe(
    [1, 2, 3],
    triage(
      (event: number) => event % 2 === 0,
      map((v) => v * 2),
    ),
  );

  assertEquals(await Array.fromAsync(stream), [1, 4, 3]);
});
