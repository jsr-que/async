import { Database } from "@db/sqlite";
import { delay } from "@std/async";
import { monotonicUlid } from "@std/ulid";
import type { JsonObject } from "type-fest";
import { persisted } from "../persisted.ts";

export class DisposableDatabase extends Database implements Disposable {
  [Symbol.dispose]() {
    this.close();
  }
}

export type Message = {
  /** ULID */
  id: string;

  createdAt: string;

  /** Soft-delete after successful processing */
  deletedAt: string | null;

  /** JSON message content */
  content: JsonObject;
};

export const sqlite = <T>(filename: string): <TReturn, TNext>(
  it: Iterable<T> | AsyncIterable<T>,
) => AsyncGenerator<T, TReturn, TNext> => {
  const activeDb = new WeakSet<DisposableDatabase>();

  let lastMessage: Message | undefined = undefined;

  return persisted<T, DisposableDatabase>({
    initialize: () => {
      const db = new DisposableDatabase(filename);

      db.run(/* SQL */ `
        PRAGMA journal_mode=WAL;

        CREATE TABLE IF NOT EXISTS Messages (
          id TEXT PRIMARY KEY,
          createdAt datetime NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
          deletedAt datetime,
          content JSON NOT NULL
        );

        CREATE INDEX IF NOT EXISTS Messages_createdAt
          ON Messages (deletedAt, createdAt);

        CREATE INDEX IF NOT EXISTS Messages_deletedAt
          ON Messages (deletedAt);
      `);

      activeDb.add(db);

      return db;
    },
    enqueue(message) {
      const id = (message as JsonObject).id?.toString().trim() ||
        monotonicUlid();

      const contents = JSON.stringify(message);

      this.sql`
        INSERT INTO Messages (id, content)
          VALUES (${id}, ${contents})
        ON CONFLICT (id) DO UPDATE SET
          content = ${contents}
      `;

      // Do not defer macrotask because upstream yields are usually assumed to
      // be a guaranteed storage here unless an error is thrown here.
      // await delay(0);
    },
    async dequeue() {
      if (lastMessage) {
        this.sql`
          UPDATE Messages
          SET deletedAt = CURRENT_TIMESTAMP
          WHERE id = ${lastMessage.id};
        `;
      }

      while (activeDb.has(this)) {
        [lastMessage] = this.sql<Message>`
          SELECT * FROM Messages
          WHERE deletedAt IS NULL
          ORDER BY createdAt
          LIMIT 1
        `;

        if (lastMessage) {
          return lastMessage.content as T;
        }

        await delay(0);
      }
    },
    return() {
      activeDb.delete(this);
    },
  });
};
