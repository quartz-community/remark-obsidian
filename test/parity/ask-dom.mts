/**
 * CLI for the DOM probe.
 *
 *     npx tsx --conditions=development test/parity/ask-dom.mts '==hi==' '*em*'
 *     npx tsx --conditions=development test/parity/ask-dom.mts --file questions.json
 *
 * The library lives in `ask-dom.ts` so other harness files can import it; importing a `.mts`
 * is not allowed.
 */
import fs from "node:fs";

import { askDom } from "./ask-dom.js";

const args = process.argv.slice(2);
const fileAt = args.indexOf("--file");
const questions =
  fileAt === -1
    ? args
    : (JSON.parse(fs.readFileSync(args[fileAt + 1]!, "utf8")) as string[]);
if (questions.length === 0) {
  console.log("usage: ask-dom.mts <markdown>... | --file questions.json");
  process.exit(1);
}
const answers = askDom(questions);
for (const [index, answer] of answers.entries()) {
  console.log(`\n== ${JSON.stringify(questions[index])}`);
  for (const [key, value] of Object.entries(answer)) {
    console.log(`   ${key.padEnd(11)}${JSON.stringify(value)}`);
  }
}
