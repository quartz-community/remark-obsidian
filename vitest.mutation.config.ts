import { defineConfig } from "vitest/config";

/**
 * The suite Stryker runs against each mutant.
 *
 * Two files are left out, neither for being slow in itself. `pathological`
 * spawns a child process per shape and asserts only that a parse finishes, so
 * a mutant that changes an answer survives it while costing a minute; and
 * `chain` renders through the published sibling, which no mutant of this
 * package can affect. Everything assertion-bearing stays, and runs in about
 * five seconds.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/pathological.test.ts",
      "**/parity/chain.test.ts",
    ],
  },
});
