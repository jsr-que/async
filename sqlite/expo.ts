/**
 * @module
 *
 * Async iterable pipe with values persisted using `expo-sqlite`.
 */

import { monotonicUlid } from "@std/ulid";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import type { JsonObject } from "type-fest";
import { persisted } from "../persisted.ts";
import type { AsyncIterablePipe } from "../pipe.ts";
import type { PersistedMessage } from "./common.ts";

/**
 * Disposable SQLite database with `expo-sqlite` implementation.
 */
export interface DisposableExpoSQLite extends SQLiteDatabase, AsyncDisposable {}

const createConnection = async (
  database: string,
  location?: string,
): Promise<DisposableExpoSQLite> => {
  const db = await openDatabaseAsync(database, undefined, location);

  return Object.assign(db, {
    async [Symbol.asyncDispose]() {
      await db.closeAsync();
    },
  });
};

/**
 * An async iterable stream persisted with `expo-sqlite`.
 */
export const sqlite = <T>(
  database: string,
  location?: string,
): AsyncIterablePipe<T> => {
  const connections = new WeakSet<DisposableExpoSQLite>();

  let lastMessage: PersistedMessage | null = null;

  return persisted<T, DisposableExpoSQLite>({
    async initialize() {
      const db = await createConnection(database, location);

      await db.execAsync(/* SQL */ `
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
    async enqueue(message) {
      const id = (message as JsonObject).id?.toString().trim() ||
        monotonicUlid();

      const contents = JSON.stringify(message);

      await this.execAsync(/* SQL */ `
        INSERT INTO Messages (id, content)
          VALUES (${id}, ${contents})
        ON CONFLICT (id) DO UPDATE SET
          content = ${contents}
      `);

      // Do not defer macrotask because upstream yields are usually assumed to
      // be a guaranteed storage here unless an error is thrown here.
      // await delay(0);
    },
    async dequeue() {
      if (lastMessage) {
        await this.execAsync(/* SQL */ `
          UPDATE Messages
          SET deletedAt = CURRENT_TIMESTAMP
          WHERE id = ${lastMessage.id};
        `);
      }

      while (connections.has(this)) {
        const row = await this.getFirstAsync<PersistedMessage>(/* SQL */ `
          SELECT * FROM Messages
          WHERE deletedAt IS NULL
          ORDER BY createdAt
          LIMIT 1
        `);

        lastMessage = row;

        if (lastMessage) {
          return JSON.parse(lastMessage.content) as T;
        }
      }
    },
    async return() {
      if (!Symbol.dispose && !Symbol.asyncDispose) {
        await this.closeAsync();
      }

      connections.delete(this);
    },
  });
};
