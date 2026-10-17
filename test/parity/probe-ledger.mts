/**
 * Record a live probe's answer so a later change cannot silently contradict it.
 *
 *     PARITY_REFEREE_DIR=... npx tsx --conditions=development \
 *       test/parity/probe-ledger.mts --record /tmp/probes.json
 *     npx tsx --conditions=development test/parity/probe-ledger.mts --status
 *
 * WHY THIS EXISTS, from two consecutive failures rather than from taste.
 *
 * `corpus.ts` already asserts a document against Obsidian, and it is the right instrument -- but
 * promoting a case costs a ten-minute `parity-record` run, so an exploratory sweep never gets
 * recorded and nothing guards it afterwards. Both recent implementations were derailed by that
 * gap:
 *
 * - `itemCommentLazyTransform` had two defects -- the uncle shape inside a quote, and
 *   `normalize.ts` hiding a comment's following siblings -- and BOTH were caught only because
 *   nine probes had happened to be promoted into the corpus an hour earlier.
 * - the leading-tab tokenizer change could not reproduce a single one of the SIXTY probes that
 *   justified it, in either scoping, and that was discovered by hand-writing a throwaway
 *   tree-printer twice. Nothing in the harness compared the implementation against its own
 *   measurements.
 *
 * So this is the corpus's contract at a probe's price: one second to record, no goldens cycle,
 * and `probes.test.ts` asserts it on every change.
 *
 * IT IS A CHANGE DETECTOR, NOT A PERFECTION GATE, which is the whole design. An exploratory
 * probe usually records a DIVERGENCE -- that is what makes it worth probing -- so a gate
 * demanding agreement would be red from the first entry and promptly ignored, which these notes
 * already say about perfection gates. Each entry therefore stores Obsidian's answer AND ours at
 * record time, and the test asserts OURS IS UNCHANGED. A probe that starts matching fails just
 * as loudly as one that stops, exactly as a `replicate` corpus case does, so neither direction
 * can pass unnoticed.
 */
import fs from "node:fs";
import path from "node:path";

import { ask } from "./probe-channel.js";
import { refereeFacts } from "./referee-facts.js";
import { LEDGER, read, same, type LedgerEntry } from "./probe-ledger.js";

const argv = process.argv.slice(2);
const valueOf = (flag: string): string | undefined => {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
};

if (argv.includes("--status")) {
  const entries = read();
  let agreeing = 0;
  let drifted = 0;
  for (const entry of entries) {
    const ours = refereeFacts(entry.markdown);
    if (
      same(entry.obsidian.defs, ours.defs) &&
      (!entry.refsTrustworthy || same(entry.obsidian.refs, ours.refs))
    ) {
      agreeing += 1;
    }
    if (
      !same(entry.ours.defs, ours.defs) ||
      !same(entry.ours.refs, ours.refs)
    ) {
      drifted += 1;
    }
  }
  console.log(`probe-ledger: ${entries.length} probes`);
  console.log(`  agreeing with Obsidian now : ${agreeing}`);
  console.log(`  DRIFTED since recording    : ${drifted}`);
  if (drifted > 0) {
    console.log(
      "  re-run with --record to accept, after checking the change is intended",
    );
  }
  process.exit(0);
}

const recordFrom = valueOf("--record");
if (recordFrom === undefined) {
  console.log("probe-ledger: --record <file.json> | --status");
  console.log('  the file is [{ "markdown": "...", "note": "..." }, ...]');
  process.exit(0);
}

interface Request {
  readonly markdown: string;
  readonly note?: string;
}
const asked = JSON.parse(fs.readFileSync(recordFrom, "utf8")) as Request[];
const answers = await ask(asked.map((request) => request.markdown));

const version = (() => {
  try {
    const golden = JSON.parse(
      fs.readFileSync(
        path.join(import.meta.dirname, "goldens/obsidian.json"),
        "utf8",
      ),
    ) as { obsidian?: { app?: string } };
    return golden.obsidian?.app ?? "unknown";
  } catch {
    return "unknown";
  }
})();

// Merged by MARKDOWN, so re-recording a probe updates it instead of duplicating it, and a probe
// nobody re-asked keeps the answer it was taken with.
const existing = new Map(read().map((entry) => [entry.markdown, entry]));
for (const [at, request] of asked.entries()) {
  const obs = answers[at]!;
  const ours = refereeFacts(request.markdown);
  existing.set(request.markdown, {
    markdown: request.markdown,
    note: request.note ?? existing.get(request.markdown)?.note ?? "",
    obsidian: { defs: obs.defs, refs: obs.refs },
    ours: { defs: ours.defs, refs: ours.refs },
    refsTrustworthy: obs.refsTrustworthy,
    recordedAt: new Date().toISOString(),
    obsidianVersion: version,
  });
}
const merged = [...existing.values()].sort((a, b) =>
  a.markdown < b.markdown ? -1 : a.markdown > b.markdown ? 1 : 0,
);
fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
fs.writeFileSync(LEDGER, `${JSON.stringify(merged, null, 2)}\n`);
console.log(
  `probe-ledger: recorded ${asked.length}, ledger now holds ${merged.length}`,
);
const diverging = merged.filter(
  (entry) =>
    !same(entry.obsidian.defs, entry.ours.defs) ||
    (entry.refsTrustworthy && !same(entry.obsidian.refs, entry.ours.refs)),
).length;
console.log(
  `  ${merged.length - diverging} agree with Obsidian, ${diverging} diverge`,
);
