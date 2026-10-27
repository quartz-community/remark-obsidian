/**
 * Does live preview's comment extent EXPLAIN the referee's answer?
 *
 * The quote-depth `%%` family was refused three times today, and all three refusals failed the
 * same way: the rule was right about the OPENER -- six probes agree a `> > %%` suppresses a
 * root definition below it -- and every candidate had to GUESS where the comment closes.
 * `region ends at the first blank line` dropped definitions twenty lines away, which is how
 * 18/65 became 5/11 and still did not pay.
 *
 * `lp-extent.mts` established that live preview's closing boundary matches `metadataCache`
 * wherever both can see one, nine of nine, including a comment nested in a quote. So this asks
 * the question that decides whether that is worth anything: take live preview's comment extent
 * as the boundary, suppress the definitions inside it, and see whether the result equals the
 * referee's recorded answer.
 *
 * AGREEMENT HERE IS NOT A RULE. Live preview cannot be consulted from a remark plugin -- there
 * is no Obsidian at parse time -- so a boundary read is a MEASUREMENT used to derive a rule,
 * never a runtime input. What it replaces is the guessing, which is the part that failed.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

import { refereeFacts } from "./referee-facts.js";

const LOG_LINE = /^\d{4}-\d{2}-\d{2} /u;

function evaluate(code: string): string {
  return execFileSync("obsidian", ["eval", `code=${code}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 180_000,
  })
    .split("\n")
    .filter((line) => !LOG_LINE.test(line) && line.trim() !== "")
    .map((line) => line.replace(/^=> /u, ""))
    .join("\n")
    .trim();
}

interface LpAnswer {
  readonly nodes?: [string, number, number][];
  readonly error?: string;
}

function askLivePreview(documents: readonly string[]): LpAnswer[] {
  const encoded = JSON.stringify(
    documents.map((text) => Buffer.from(text, "utf8").toString("base64")),
  );
  evaluate(
    `window.__lpc='pending';(async()=>{try{const qs=${encoded};` +
      `const md=qs.map(q=>new TextDecoder().decode(Uint8Array.from(atob(q),c=>c.charCodeAt(0))));` +
      `window.__lpc=JSON.stringify(await window.__parityLivePreview(md))}` +
      `catch(e){window.__lpc=JSON.stringify([{error:String(e&&e.message||e).slice(0,200)}])}})()`,
  );
  // An EMPTY reply is not an answer. `obsidian eval` occasionally returns nothing at all, and
  // treating that as final fed `JSON.parse("")` and killed a run two chunks in. Polling while
  // the value is pending OR empty is the only safe stop condition -- and it has to throw
  // rather than return `[]`, because an empty batch would read as "no document disagreed".
  let raw = "pending";
  for (
    let attempt = 0;
    attempt < 2000 && (raw === "pending" || raw === "");
    attempt++
  ) {
    raw = evaluate("window.__lpc");
  }
  if (raw === "pending" || raw === "") {
    throw new Error("live preview did not finish");
  }
  return JSON.parse(raw) as LpAnswer[];
}

/** Zero-based line of a UTF-16 offset. Lines, not offsets, because the referee stores lines. */
function lineOf(text: string, offset: number): number {
  let line = 0;
  for (let index = 0; index < offset && index < text.length; index++) {
    if (text[index] === "\n") line += 1;
  }
  return line;
}

const documents = JSON.parse(
  fs.readFileSync("/tmp/opencode/depth2.json", "utf8"),
) as { text: string; defs: [string, number, number, number][] }[];

const alive = evaluate("typeof window.__parityLivePreview");
if (alive !== "function") {
  console.log(
    `lp-comment: __parityLivePreview is ${alive}; reload parity-probe`,
  );
  process.exit(1);
}

console.log(
  `lp-comment: ${String(documents.length)} documents with a depth-2+ quoted %%\n`,
);

const CHUNK = 20;
let explained = 0;
let already = 0;
let unexplained = 0;
let noComment = 0;
const examples: string[] = [];

for (let from = 0; from < documents.length; from += CHUNK) {
  const batch = documents.slice(from, from + CHUNK);
  const answers = askLivePreview(batch.map((d) => d.text));
  for (const [index, entry] of batch.entries()) {
    const answer = answers[index];
    const nodes = (answer?.nodes ?? []).filter(([name]) =>
      name.split("_").some((part) => part === "comment"),
    );
    const ours = refereeFacts(entry.text);
    // EXISTENCE, not the full tuple. The rule under test is which definitions a comment
    // SUPPRESSES, and a definition's END LINE is a different family entirely -- several of
    // these documents agree on every name and column while differing only on `endLine`, which
    // the `def-end` buckets own and which no comment boundary can fix. Scoring the full tuple
    // counted those as failures of this rule and understated it at 10 of 27.
    const key = (d: readonly [string, number, number, number]): string =>
      JSON.stringify([d[0], d[1], d[2]]);
    const want = JSON.stringify([...entry.defs].map(key).sort());
    const base = JSON.stringify(ours.defs.map(key).sort());
    if (base === want) {
      already += 1;
      continue;
    }
    if (nodes.length === 0) {
      noComment += 1;
      continue;
    }
    // Live preview's comment extent, as whole lines: a definition whose label line falls
    // inside it is buried, which is the rule the opener probes established.
    // ONLY `%%` REGIONS, anchored on an opener. Live preview names BOTH comment syntaxes
    // `comment`, and taking every such node suppressed a definition sitting on a line with an
    // HTML comment on it -- `> [^Note]: More<!-- [^b] -->` -- which Obsidian defines. The two
    // are distinguishable:
    //
    //     x %%c%%            comment_comment-start_formatting / comment / comment_comment-end_formatting
    //     x <!-- c -->       comment                                  <- no markers at all
    //     %% / block / %%    comment-start ... comment-end
    //     <!-- / block / --> comment_hmd-html-begin ... comment_hmd-html-end
    //
    // so a region must START at a `comment-start` and runs to the matching `comment-end`, or
    // to the end of the document when the opener is unclosed -- which is the case the whole
    // family is about. An inline HTML comment has no opener node and is excluded by that
    // anchoring rather than by naming `hmd-html` explicitly.
    const part = (name: string, want: string): boolean =>
      name.split("_").some((piece) => piece === want);
    const opens = nodes
      .filter(([name]) => part(name, "comment-start"))
      .map(([, start]) => start);
    const closes = nodes
      .filter(([name]) => part(name, "comment-end"))
      .map(([, , end]) => end);
    const buried = new Set<number>();
    for (const start of opens) {
      const close = closes.find((end) => end > start);
      const reach = close ?? entry.text.length;
      for (
        let line = lineOf(entry.text, start);
        line <= lineOf(entry.text, Math.max(start, reach - 1));
        line++
      ) {
        buried.add(line);
      }
    }
    const after = JSON.stringify(
      ours.defs
        .filter((d) => !buried.has(d[1]))
        .map(key)
        .sort(),
    );
    if (after === want) {
      explained += 1;
      if (examples.length < 4) {
        examples.push(
          `  EXPLAINED ${JSON.stringify(entry.text).slice(0, 96)}\n` +
            `      lp comment lines ${JSON.stringify([...buried].sort((a, b) => a - b))}\n` +
            `      ours ${base}\n      obs  ${want}`,
        );
      }
    } else {
      unexplained += 1;
      if (examples.length < 8) {
        examples.push(
          `  NOT      ${JSON.stringify(entry.text).slice(0, 96)}\n` +
            `      lp comment lines ${JSON.stringify([...buried].sort((a, b) => a - b))}\n` +
            `      ours ${base}\n      after ${after}\n      obs  ${want}`,
        );
      }
    }
  }
  process.stdout.write(
    `  asked ${String(Math.min(from + CHUNK, documents.length))}/${String(documents.length)}\r`,
  );
}

console.log(`\n`);
console.log(`  already agree (nothing to explain) : ${String(already)}`);
console.log(`  EXPLAINED by live preview's extent : ${String(explained)}`);
console.log(`  still unexplained                  : ${String(unexplained)}`);
console.log(`  no comment node at all             : ${String(noComment)}`);
console.log();
for (const example of examples) console.log(example);
console.log(
  explained + unexplained === 0
    ? "\n  NO EVIDENCE: no document disagreed and had a comment, so this says nothing."
    : `\n  live preview's boundary accounts for ${String(explained)} of ${String(explained + unexplained)} disagreeing documents.`,
);
