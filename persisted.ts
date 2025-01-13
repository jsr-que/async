import type { Promisable } from "type-fest";
import type { AsyncIterablePipe } from "./pipe.ts";

export type PersistedOptions<
  T,
  Storage extends Disposable | AsyncDisposable,
> = {
  initialize: () => Promisable<Storage>;
  /** Persists incoming messages to storage. */
  enqueue: (this: Storage, message: T) => Promisable<void>;
  /** Returns the next message when available, or `undefined` to exit. */
  dequeue: (this: Storage) => Promisable<T | void>;
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

export function persisted<
  T,
>(
  options: PersistedOptionsInitializable<T>,
): AsyncIterablePipe<T>;
export function persisted<
  T,
  Storage extends Disposable | AsyncDisposable,
>(
  options: PersistedOptions<T, Storage>,
): AsyncIterablePipe<T>;
export function persisted<
  T,
  Storage extends Disposable | AsyncDisposable,
>(
  options:
    | PersistedOptions<T, Storage>
    | PersistedOptionsInitializable<T>,
): AsyncIterablePipe<T> {
  return async function* (iterable) {
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

      if (message === undefined) {
        break;
      }

      yield message;
    }
  };
}
