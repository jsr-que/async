import type { Promisable } from "./common.ts";

export type PersistedOptions<
  Message,
  Storage extends Disposable | AsyncDisposable,
> = {
  initialize: () => Promisable<Storage>;
  /** Persists incoming messages to storage. */
  enqueue: (this: Storage, message: Message) => Promisable<void>;
  /** Returns the next message when available, or `undefined` to exit. */
  dequeue: (this: Storage) => Promisable<Message | void>;
  /** Stops a pending dequeue when upstream iterator is closed. */
  return?: (this: Storage) => Promisable<void>;
};

export type PersistedOptionsInitializable<Message> = {
  initialize?: undefined;
  /** Persists incoming messages to storage. */
  enqueue: (message: Message) => Promisable<void>;
  /** Returns the next message when available, or `undefined` to exit. */
  dequeue: () => Promisable<Message | void>;
  /** Stops a pending dequeue when upstream iterator is closed. */
  return?: () => Promisable<void>;
};

export type PersistedReturnType<T> = <TReturn, TNext>(
  iterable:
    | Iterable<T, TReturn, TNext>
    | AsyncIterable<T, TReturn, TNext>,
) => AsyncGenerator<T, TReturn, TNext>;

export function persisted<Message>(
  options: PersistedOptionsInitializable<Message>,
): PersistedReturnType<Message>;
export function persisted<
  Message,
  Storage extends Disposable | AsyncDisposable,
>(options: PersistedOptions<Message, Storage>): PersistedReturnType<Message>;
export function persisted<
  Message,
  Storage extends Disposable | AsyncDisposable,
>(
  options:
    | PersistedOptions<Message, Storage>
    | PersistedOptionsInitializable<Message>,
) {
  return async function* (
    iterable: Iterable<Message> | AsyncIterable<Message>,
  ) {
    // Initialize storage at this scope to allow cleanup on exit.
    await using db = await options.initialize?.();

    (async () => {
      for await (const message of iterable) {
        await options.enqueue.call(db!, message);
      }

      await options.return?.call(db!);
    })();

    while (true) {
      const message = await options.dequeue.call(db!);

      if (message === undefined) break;

      yield message;
    }
  };
}
