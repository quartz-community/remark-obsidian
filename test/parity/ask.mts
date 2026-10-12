/**
 * Ask a RUNNING Obsidian what it makes of arbitrary markdown, in about two seconds.
 *
 *     npx tsx --conditions=development test/parity/ask.mts '[^1]: def' 'use[^1]'
 *     npx tsx --conditions=development test/parity/ask.mts --file questions.json
 *
 * This is the cheap half of the oracle. `parity:record` boots Obsidian under Xvfb, renders
 * all 3,403 corpus cases and rewrites the goldens -- seventy seconds, and it only answers
 * for documents already committed to `corpus.ts`. So every question used to cost a corpus
 * edit, a collision check, a recording and a triage pass, which is a commit cycle per
 * question and the reason probing felt expensive.
 *
 * The Obsidian CLI (1.13+) evaluates JavaScript in the running app, so the same
 * `computeMetadataAsync` the recorder uses can be called directly on any string. Nothing is
 * written, no corpus changes, no goldens move. Use it to settle a rule in seconds, and
 * PROMOTE the shapes that settled something into `corpus.ts` afterwards -- the corpus is
 * still what the gate asserts, and a probe nobody recorded proves nothing to CI.
 *
 * Four details are load-bearing, three of them learned from `quartz-syncer`'s operability
 * notes, which document this channel for its own plugin:
 *
 * - **`2>/dev/null`.** Every CLI call prints GTK and Electron warnings on Linux.
 * - **Obsidian must be running with a vault open.** A cold `obsidian eval` launches the app
 *   and returns the launcher's log lines instead of a result; with no vault open it returns
 *   nothing at all, silently.
 * - **The result window is roughly 5-15 ms.** Anything logged after `eval` returns is lost
 *   and the call reports success with empty output, so an `await` cannot be answered in one
 *   call. The pattern is to stash onto a global and read it back with a second, synchronous
 *   eval -- which is why this batches every question into one stash.
 * - **Markdown is passed base64-encoded.** It travels through a shell argument and then a
 *   JavaScript string literal; quoting it twice is how a probe silently becomes a different
 *   document, and these notes already record a tab and a U+00A0 surviving one layer and not
 *   the other.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

interface Answer {
  readonly markdown: string;
  readonly compute: unknown;
}

const LOG_LINE = /^\d{4}-\d{2}-\d{2} /u;

function evaluate(code: string): string {
  const out = execFileSync("obsidian", ["eval", `code=${code}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 120_000,
  });
  return out
    .split("\n")
    .filter((line) => !LOG_LINE.test(line) && line.trim() !== "")
    .map((line) => line.replace(/^=> /u, ""))
    .join("\n")
    .trim();
}

const argv = process.argv.slice(2);
const questions: string[] =
  argv[0] === "--file"
    ? (JSON.parse(fs.readFileSync(argv[1]!, "utf8")) as string[])
    : argv;

if (questions.length === 0) {
  console.log("ask: give one or more markdown strings, or --file <json array>");
  console.log("     Obsidian must be running with a vault open.");
  process.exit(0);
}

// Liveness first, because every other failure mode here is silent. A cold app answers with
// launcher logs and a vault-less one answers with nothing, and both look like "Obsidian says
// this document has no metadata" to a caller that does not check.
const alive = evaluate("typeof app.metadataCache.computeMetadataAsync");
if (alive !== "function") {
  console.log(`ask: Obsidian is not answering (got ${JSON.stringify(alive)})`);
  console.log("     start it, open a vault, and try again");
  process.exit(1);
}

const encoded = JSON.stringify(
  questions.map((markdown) => Buffer.from(markdown, "utf8").toString("base64")),
);
// One stash for every question, then one read: the per-call overhead is the expensive part,
// and the result window makes a per-question round trip impossible anyway.
evaluate(
  `window.__ask='pending';(async()=>{const qs=${encoded};const out=[];` +
    `for(const q of qs){const b=Uint8Array.from(atob(q),c=>c.charCodeAt(0)).buffer;` +
    `out.push(await app.metadataCache.computeMetadataAsync(b))}` +
    `window.__ask=JSON.stringify(out)})()`,
);

let raw = "pending";
for (let attempt = 0; attempt < 40 && raw === "pending"; attempt++) {
  raw = evaluate("window.__ask");
}
if (raw === "pending") {
  console.log("ask: Obsidian did not finish within 40 polls");
  process.exit(1);
}

const answers = JSON.parse(raw) as unknown[];
const result: Answer[] = questions.map((markdown, index) => ({
  markdown,
  compute: answers[index],
}));
console.log(JSON.stringify(result, null, 2));
