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
  /** Which Obsidian answered. The goldens pin 1.14.4; anything else is a different parser. */
  readonly obsidian: string;
  readonly compute: unknown;
  readonly synth?: {
    readonly safe: boolean;
    readonly asked: string | undefined;
    readonly refs: unknown;
  };
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

const argv = process.argv.slice(2).filter((a) => a !== "--synth");
const questions: string[] =
  argv[0] === "--file"
    ? (JSON.parse(fs.readFileSync(argv[1]!, "utf8")) as string[])
    : argv;

/**
 * `--synth` makes `footnoteRefs` usable for UNDEFINED names, with a safety check.
 *
 * `footnoteRefs` lists only references whose name HAS a definition, so a probe written to ask
 * about reference behaviour reports an empty array for every undefined name and agrees with
 * anything. These notes record that costing three of four first-run "diffs" in one audit and a
 * false staleness alarm against the referee corpus.
 *
 * The fix is the sibling project's: supply a definition for every undefined name and ask again.
 * Definitions are appended at the END, so every offset in the original region is unchanged and
 * a reference position read from the augmented parse is valid for the original document.
 *
 * APPENDING IS NOT ALWAYS SAFE, which is why this reports rather than assumes. An unclosed `%%`
 * runs to the end of the note, so added text lands INSIDE the comment and the synthesised
 * definitions are buried -- the document's own parse changes. So both documents are asked and
 * the original region is compared: `synth.safe` is false when the augmentation disturbed it,
 * and a caller must not read `synth.refs` in that case. The sibling project phrases the same
 * guard as keeping whichever probe left the note's own parse unchanged.
 */
const wantSynth = process.argv.includes("--synth");
const REFERENCE = /\[\^([^\]\s]+)\]/gu;
/**
 * A definition for EVERY referenced name, not only the textually-undefined ones.
 *
 * The first version skipped a name whose `[^x]:` label appears in the source, which is wrong in
 * exactly the case this flag exists for: `> %%` / `[^3]: Text` has a label and Obsidian defines
 * NOTHING, because the unclosed comment buries it. So the scan skipped augmenting the one
 * document that needed it and reported `refs: []` -- which reads as "Obsidian indexes no
 * reference here" and actually meant "the probe did not fire". Eighth instance of that shape in
 * these notes, and the reason `synthesised` below is checked for rather than assumed.
 *
 * A duplicate definition is harmless: the first one wins, so a name already defined keeps its
 * own answer and a name only apparently defined gets a real one.
 */
const augment = (markdown: string): string => {
  const names: string[] = [];
  for (const hit of markdown.matchAll(REFERENCE)) {
    if (!names.includes(hit[1]!)) names.push(hit[1]!);
  }
  if (names.length === 0) return markdown;
  const tail = names.map((name) => `[^${name}]: synthesised`).join("\n\n");
  return `${markdown.endsWith("\n") ? markdown : `${markdown}\n`}\n${tail}\n`;
};

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

/**
 * Which Obsidian answered, stamped into the output the way the recorder stamps `apiVersion`.
 *
 * The goldens pin 1.14.4 and the referee's answers were recorded against one release, so a
 * probe answered by a different one is measuring a different parser -- and until now nothing
 * in this output said which. That is not hypothetical: a 1.15.0 alpha was started at 19:03
 * on the day this was written, two minutes after the last probe of a session that derived
 * three rules, and only the process start time distinguished those answers from 1.15.0's.
 *
 * `require('obsidian')` is not resolvable in the eval context, so the version comes from
 * Electron's own app record, with the candidates tried in order and `null` when none answer.
 */
const askedVersion = (() => {
  // The CLI's own `version` subcommand, which is the only source that answers correctly.
  // Everything reachable from `eval` is wrong or absent: Obsidian's version is a minified
  // module-local constant (`Zr="1.15.0"` in one build, `goe="1.14.4"` in another) exposed on
  // no property path, so `app.apiVersion`, `app.appVersion` and `app.version` all return
  // nothing, while `electron.remote.app.getVersion()` and `ipcRenderer.sendSync("version")`
  // returned 1.14.4 for a running 1.15.0 -- the first version of this stamp used the former
  // and reported 1.15.0 once and 1.14.4 later for the same app.
  const raw = execFileSync("obsidian", ["version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 120_000,
  });
  // `1.15.0 (installer 1.15.0)`
  return /^\s*(\S+)\s*\(installer\s+(\S+)\)/u.exec(raw)?.[1] ?? "UNKNOWN";
})();

// With `--synth` every question is asked TWICE: as written, and with a definition appended for
// each undefined name. The pair is what lets the safety check below compare the original region.
const asked: string[] = wantSynth
  ? questions.flatMap((markdown) => [markdown, augment(markdown)])
  : questions;
const encoded = JSON.stringify(
  asked.map((markdown) => Buffer.from(markdown, "utf8").toString("base64")),
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

interface Positioned {
  readonly id?: string;
  readonly position?: { readonly start: { readonly offset: number } };
}
/** Entries that start inside the ORIGINAL region, which augmentation must leave alone. */
const within = (list: readonly Positioned[] | undefined, limit: number) =>
  JSON.stringify(
    (list ?? [])
      .filter((e) => (e.position?.start.offset ?? 0) < limit)
      .map((e) => [e.id, e.position?.start.offset]),
  );

const result: Answer[] = questions.map((markdown, index) => {
  if (!wantSynth)
    return { markdown, obsidian: askedVersion, compute: answers[index] };
  const plain = answers[index * 2] as
    { footnotes?: Positioned[]; sections?: Positioned[] } | undefined;
  const synth = answers[index * 2 + 1] as
    | {
        footnotes?: Positioned[];
        sections?: Positioned[];
        footnoteRefs?: Positioned[];
      }
    | undefined;
  const limit = Buffer.from(markdown, "utf8").length;
  // THREE conditions, and the third is the one the first version lacked. Comparing the
  // original region catches an augmentation that disturbed the document; it does NOT catch one
  // the document SWALLOWED, where the original region is pristine and the appended definitions
  // landed inside an unclosed `%%` or fence. Then `refs` is empty because the probe never
  // fired, which is indistinguishable from Obsidian indexing nothing.
  const appended = (synth?.footnotes ?? []).filter(
    (f) => (f.position?.start.offset ?? 0) >= limit,
  ).length;
  const wanted = new Set(
    [...markdown.matchAll(REFERENCE)].map((hit) => hit[1]!.toLowerCase()),
  ).size;
  const safe =
    within(plain?.footnotes, limit) === within(synth?.footnotes, limit) &&
    within(plain?.sections, limit) === within(synth?.sections, limit) &&
    appended === wanted;
  return {
    markdown,
    obsidian: askedVersion,
    compute: plain,
    synth: {
      // False means the appended definitions changed the document's OWN parse -- an unclosed
      // `%%` or fence swallowing them -- so `refs` below describes a different document and
      // must not be read as an answer about this one.
      safe,
      asked: asked[index * 2 + 1],
      refs: synth?.footnoteRefs ?? [],
    },
  } as Answer;
});
/**
 * Warn when `footnoteRefs` cannot answer the question being asked.
 *
 * The field lists only references whose name HAS a definition, so a probe reading it for an
 * UNDEFINED name gets `[]` and reads it as "Obsidian indexes no reference here". That is the
 * trap `--synth` exists for, and knowing about it is not enough: the setext rule was scored
 * twice and refused twice off `refs=[]` readings before the referee's own `refs` field showed
 * Obsidian reporting the reference all along.
 *
 * On stderr, because stdout is the JSON every probe pipeline parses.
 */
if (!wantSynth) {
  const starved = result.filter((answer) => {
    const compute = answer.compute as
      { footnoteRefs?: readonly { id?: string }[] } | undefined;
    // An ABSENT `footnoteRefs` is the STRONGEST form of the trap, not a reason to skip.
    // Obsidian omits the key entirely when it indexes no reference -- `use[^1] and [^2]`
    // comes back with `compute` holding `["sections"]` and nothing else -- so the first
    // version of this guard declined exactly the case it exists to catch, and the break
    // test is what said so. Only a missing `compute` means the answer itself failed.
    if (compute === undefined) return false;
    const indexed = new Set(
      (compute.footnoteRefs ?? []).map((ref) => ref.id?.toLowerCase()),
    );
    return [...answer.markdown.matchAll(REFERENCE)].some(
      (hit) => !indexed.has(hit[1]!.toLowerCase()),
    );
  });
  if (starved.length > 0) {
    console.error(
      `ask: ${starved.length} of ${result.length} answers hold a [^name] that footnoteRefs does NOT list.`,
    );
    console.error(
      "     That field is definition-gated, so [] means 'no DEFINED reference', not 'no reference'.",
    );
    console.error(
      "     Re-ask with --synth before concluding anything from it.",
    );
  }
}
const PINNED = (
  JSON.parse(
    fs.readFileSync(new URL("goldens/obsidian.json", import.meta.url), "utf8"),
  ) as { obsidian?: { app?: string } }
).obsidian?.app;
if (askedVersion !== PINNED) {
  console.error(
    `ask: ANSWERED BY OBSIDIAN ${askedVersion}, but the goldens pin ${PINNED ?? "?"}.`,
  );
  console.error(
    "     These answers describe a DIFFERENT parser than the corpus and the referee.",
  );
  console.error(
    "     Fine for characterising a release; do not settle a rule against the goldens with it.",
  );
}
console.log(JSON.stringify(result, null, 2));
