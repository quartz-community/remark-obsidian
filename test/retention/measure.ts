// Prints the heap the parsed tree keeps alive, in bytes, for `blocks` repetitions of a small
// table followed by a paragraph (#48). Run in a fresh process with `--expose-gc`, so that what
// is measured is what the tree holds after a full collection, not garbage awaiting one.
import remarkParse from "remark-parse";
import { unified } from "unified";

import remarkObsidian from "../../src/index.js";

const gc = (globalThis as { gc?: () => void }).gc;
if (gc === undefined) throw new Error("run with --expose-gc");

const blocks = Number(process.argv[2]);
const block =
  "| alpha | beta |\n| --- | --- |\n| gamma | delta |\n\n" +
  "ordinary sample words in a paragraph long enough for a sliced string.\n\n";
const source = block.repeat(blocks);
const processor = unified()
  .use(remarkParse)
  .use(remarkObsidian, { preset: "legacy" })
  .freeze();

gc();
const before = process.memoryUsage().heapUsed;
const tree = processor.parse(source);
gc();
const retained = process.memoryUsage().heapUsed - before;
// The tree must still be reachable here, or the collection above could free it.
if (tree.children.length !== blocks * 2) throw new Error("unexpected tree");
process.stdout.write(String(retained));
