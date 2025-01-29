// Bundle src/mod.ts into both ESM and CJS format.
import { build } from "jsr:@deno/dnt@^0.41.3";

import pkg from "./deno.json" with { type: "json" };

await Deno.remove("./dnt", { recursive: true }).catch(() => {});

await build({
  entryPoints: ["./mod.ts"],
  outDir: "./dnt",
  shims: {
    deno: {
      test: true,
    },
  },
  package: {
    name: "@vicary/que-async",
    version: pkg.version,
    description: pkg.description,
    author: "Vicary A. <vicary.archangel@member.mensa.org>",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/jsr-que/async.git",
    },
    bugs: {
      url: "https://github.com/jsr-que/async/issues",
    },
    keywords: [
      "async",
      "await",
      "batch",
      "chunk",
      "generator",
      "iterator",
      "piping",
      "promise",
      "promises",
      "stream",
      "streaming",
      "throttle",
    ],
    funding: {
      type: "github",
      url: "https://github.com/sponsors/vicary",
    },
  },
  async postBuild() {
    // steps to run after building and before running the tests
    await Deno.copyFile("LICENSE", "dnt/LICENSE");
    await Deno.copyFile("README.md", "dnt/README.md");
  },
  typeCheck: "both",
});
