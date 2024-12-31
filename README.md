# @que/async

An experimental project for printer queue implemntation in OmniWe POS.

## Usage

```typescript
import { pipe } from "@core/pipe";
import { exponentialBackoff, retry, triage } from "@que/async";
import { sqlite } from "@que/async/sqlite/nitro";
import { citizenPrinter } from "@que/printers/citizen";
import { epsonPrinter } from "@que/printers/epson";

const retryDelay = exponentialBackoff({
  backoff: (n) => 2 ** n,
  limit: Infinity,
});

const printStream = pipe(
  printEvents(),
  sqlite("PrintQueue"),
  triage(
    (v) => v.target === "Printer A",
    retry(
      citizenPrinter("TCP:1.2.3.4"),
      retryDelay,
    ),
  ),
  triage(
    (v) => v.target === "Printer B",
    retry(
      epsonPrinter("TCP:5.6.7.8"),
      retryDelay,
    ),
  ),
);

for (const event of printStream) {
  console.debug(`Print event:`, event);
}
```
