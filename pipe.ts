export type AsyncIterablePipe<
  Input,
  Output = Input,
  Return = unknown,
> = (
  it:
    | AsyncIterable<Input, Return>
    | Iterable<Input, Return>,
) => AsyncIterableIterator<Output, Return>;

