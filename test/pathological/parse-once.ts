import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";

import remarkObsidian from "../../src/index.js";
import { SHAPES } from "./shapes.js";

/**
 * Parse one pathological shape and report how long it took.
 *
 * This runs as its own process on purpose. A catastrophic regex or a
 * quadratic tokenizer blocks the thread synchronously, so no same-thread
 * timer — vitest's included — can interrupt it. Only a parent that can kill
 * the process is a real watchdog.
 */
const [name, size] = process.argv.slice(2);
const build = name ? SHAPES[name] : undefined;
if (!build || !size) {
  console.error(`usage: parse-once <shape> <size>`);
  process.exit(2);
}

const markdown = build(Number(size));
const processor = unified()
  .use(remarkParse)
  // `remarkGfm` before `remarkObsidian`, as `chain.ts` pins it. With the old order
  // gfm's strikethrough claimed every `~`, so `legacy-delete.ts` never ran and the
  // delimiter-run shape was not measuring this package's tokenizer at all.
  .use(remarkGfm)
  .use(remarkObsidian)
  .use(remarkBreaks);

const started = performance.now();
processor.runSync(processor.parse(markdown), markdown);
process.stdout.write(String(Math.round(performance.now() - started)));
