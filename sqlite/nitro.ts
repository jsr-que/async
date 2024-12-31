import { monotonicUlid } from "@std/ulid";
import {
  type BatchQueryCommand,
  type NitroSQLiteConnection,
  open,
  type SQLiteItem,
  type SQLiteQueryParams,
  type Transaction,
} from "react-native-nitro-sqlite";
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

export class DisposableDatabase implements Disposable {
  #db: NitroSQLiteConnection;

  constructor(database: string, location?: string) {
    this.#db = open({ name: database, location });
  }

  [Symbol.dispose]() {
    this.close();
  }

  close() {
    this.#db.close();
  }

  delete() {
    this.#db.delete();
  }

  attach(database: string, alias: string, location?: string) {
    this.#db.attach(database, alias, location);
  }

  detach(alias: string) {
    this.#db.detach(alias);
  }

  transaction(fn: (tx: Transaction) => Promise<void> | void) {
    return this.#db.transaction(fn);
  }

  execute<RowData extends SQLiteItem = SQLiteItem>(
    query: string,
    params?: SQLiteQueryParams,
  ) {
    return this.#db.executeAsync<RowData>(query, params);
  }

  executeBatch(commands: BatchQueryCommand[]) {
    return this.#db.executeBatchAsync(commands);
  }

  loadFile(location: string) {
    return this.#db.loadFileAsync(location);
  }
}

export const sqlite = <T>(database: string, location?: string) => {
  const activeDb = new WeakSet<DisposableDatabase>();

  let lastMessage: Message | undefined = undefined;

  return persisted<T, DisposableDatabase>({
    async initialize() {
      const db = new DisposableDatabase(database, location);

      await db.execute(/* SQL */ `
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

      await this.execute(/* SQL */ `
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
        await this.execute(/* SQL */ `
          UPDATE Messages
          SET deletedAt = CURRENT_TIMESTAMP
          WHERE id = ${lastMessage.id};
        `);
      }

      while (activeDb.has(this)) {
        const { rows } = await this.execute<Message>(/* SQL */ `
          SELECT * FROM Messages
          WHERE deletedAt IS NULL
          ORDER BY createdAt
          LIMIT 1
        `);

        lastMessage = rows?.item(0);

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
