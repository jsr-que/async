import { delay } from "@std/async";
import { pipe } from "jsr:@core/pipe";
import { assertEquals } from "jsr:@std/assert";
import { DisposableDatabase, sqlite } from "./sqlite3.ts";

Deno.test("sqlite", async (t) => {
  const filename = await Deno.makeTempFile({ suffix: ".sqlite" });

  await t.step("should soft-delete handled messages", async () => {
    const stream = pipe(
      (async function* numbers() {
        yield 1;
        yield 2;
        yield 3;
        // Give it time to insert into database before closing the connection.
        await delay(100);
      })(),
      sqlite(filename),
    );

    // Wait for 1, leaving 2 and 3.
    const message = await stream.next();
    assertEquals(message, { value: 1, done: false });

    // Passing back to post-yield message update, but don't await for 2.
    stream.next();

    // Check current local database state.
    {
      using db = new DisposableDatabase(filename);
      const results = db.sql<
        { content: number }
      >`SELECT content FROM Messages WHERE deletedAt IS NULL`
        .map((row) => row.content);
      assertEquals(results, [2, 3]);
    }

    stream.return(undefined);

    // Prevent timer leaks in `numbers()` above
    await delay(100);
  });

  await t.step("should retain unhandled messages", async () => {
    const results: number[] = [];
    const stream = pipe(
      // deno-lint-ignore require-yield
      (async function* (): AsyncGenerator<number> {
        // Hold on until the remaining messages are yielded below.
        await delay(100);
      })(),
      sqlite(filename),
    );

    for await (const message of stream) {
      results.push(message);
    }

    assertEquals(results, [2, 3]);

    // Check current local database state.
    {
      using db = new DisposableDatabase(filename);
      const results = db.sql<
        { content: number }
      >`SELECT content FROM Messages WHERE deletedAt IS NULL`
        .map((row) => row.content);
      assertEquals(results, []);
    }
  });

  await Deno.remove(filename);
});
