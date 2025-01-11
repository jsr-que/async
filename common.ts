export type Promisable<T> = T | Promise<T>;

export type AsyncIterablePipe<Input, Output = Input> = (
  it: Iterable<Input> | AsyncIterable<Input>,
) => AsyncGenerator<Output>;
