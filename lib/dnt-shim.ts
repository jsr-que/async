/**
 * @module lib/dnt-shim
 *
 * DNT unconditionally shims Promise.withResolvers because the standard is yet
 * to name this version, e.g. ES2024, other than Latest. See PR #441.
 */

export interface PromiseWithResolvers<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

export const promiseWithResolvers = <T>(): PromiseWithResolvers<T> => {
  let resolve: (value: T | PromiseLike<T>) => void;
  let reject: (reason?: any) => void;

  const promise = new Promise<T>((resolve_, reject_) => {
    resolve = resolve_;
    reject = reject_;
  });

  return { promise, resolve: resolve!, reject: reject! };
};
