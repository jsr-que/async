# Queue

An experimental project for printer queue implemntation in OmniWe POS.

The idea is to utilize `jsr:@core/pipe` with the following functionalities:

1. Interactive retries
2. Peristence
3. Fanout

## Expected Usage

```typescript
import { pipe } from "@core/pipe";
import { exponentialBackoff, fork, retry } from "@que/async";
import { sqlite } from "@que/sqlite/nitro";
import { citizenPrinter } from "~/lib/print-streams/citizen";
import { epsonPrinter } from "~/lib/print-streams/epson";

const printStream = pipe(
  printEvents(),
  sqlite("PrintQueue"),
  fork(
    pipe(
      filter((v) => v.target === "Printer A"),
      retry(
        citizenPrinter("TCP:1.2.3.4"),
        exponentialBackoff((n) => 2 ** n),
      ),
    ),
  ),
  fork(
    pipe(
      filter((v) => v.target === "Printer B"),
      retry(
        epsonPrinter("TCP:5.6.7.8"),
        exponentialBackoff((n) => 2 ** n),
      ),
    ),
  ),
);

for (const event of printStream) {
  console.debug(`Print event:`, event);
}
```
