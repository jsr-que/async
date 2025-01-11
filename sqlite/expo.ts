import { monotonicUlid } from "@std/ulid";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import type { JsonObject } from "type-fest";
import { persisted } from "../persisted.ts";

export type Message = {
  /** ULID */
  id: string;

  createdAt: string;

  /** Soft-delete after successful processing */
  deletedAt?: string;

  /** JSON message content */
  content: string;
};

export interface DisposableDatabase extends SQLiteDatabase, AsyncDisposable {}

const createConnection = async (
  database: string,
  location?: string,
): Promise<DisposableDatabase> => {
  const db = await openDatabaseAsync(database, undefined, location);

  return Object.assign(db, {
    async [Symbol.asyncDispose]() {
      await db.closeAsync();
    },
  });
};

export const sqlite = <T>(
  database: string,
  location?: string,
): (it: Iterable<T> | AsyncIterable<T>) => AsyncGenerator<T> => {
  const activeDb = new WeakSet<DisposableDatabase>();

  let lastMessage: Message | null = null;

  return persisted<T, DisposableDatabase>({
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

      activeDb.add(db);

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

      while (activeDb.has(this)) {
        const row = await this.getFirstAsync<Message>(/* SQL */ `
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
    return() {
      activeDb.delete(this);
    },
  });
};
