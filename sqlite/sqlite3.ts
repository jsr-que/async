/**
 * @module
 *
 * Async iterable pipe with values persisted using `@db/sqlite`.
 */

import { Database } from "@db/sqlite";
import { delay } from "@std/async";
import { monotonicUlid } from "@std/ulid";
import type { JsonObject } from "type-fest";
import { persisted } from "../persisted.ts";
import type { AsyncIterablePipe } from "../pipe.ts";
import type { PersistedMessage } from "./common.ts";

/**
 * Disposable SQLite database with `@db/sqlite` implementation.
 */
export class DisposableSQLite3 extends Database implements Disposable {
  [Symbol.dispose]() {
    this.close();
  }
}

/**
 * Async iterable pipe with values persisted using `@db/sqlite`.
 */
export const sqlite = <T>(filename: string): AsyncIterablePipe<T> => {
  const connections = new WeakSet<DisposableSQLite3>();

  let lastMessage: PersistedMessage | undefined = undefined;

  return persisted<T, DisposableSQLite3>({
    initialize: () => {
      const db = new DisposableSQLite3(filename);

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

      connections.add(db);

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

      while (connections.has(this)) {
        [lastMessage] = this.sql<PersistedMessage>`
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
      if (!Symbol.dispose && !Symbol.asyncDispose) {
        this.close();
      }

      connections.delete(this);
    },
  });
};
