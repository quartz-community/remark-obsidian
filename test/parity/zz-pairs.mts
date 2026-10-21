import fs from "node:fs";
import { refereeFactsWithTree } from "./referee-facts.js";
type Rec = {
  id?: string;
  text?: string;
  defs?: [string, number, number, number][];
  refs?: [string, number, number][];
};
const recs: Rec[] = [];
for (const f of fs
  .readdirSync("/tmp/opencode/of/test/obsidian-answers")
  .sort()) {
  if (!f.endsWith(".json")) continue;
  const d: unknown = JSON.parse(
    fs.readFileSync(`/tmp/opencode/of/test/obsidian-answers/${f}`, "utf8"),
  );
  for (const r of (Array.isArray(d) ? d : []) as Rec[])
    if (r.text) recs.push(r);
}
const sigOf = (rec: Rec): string[] => {
  const g = refereeFactsWithTree(rec.text!);
  const lines = rec.text!.split("\n");
  const shape = (ln: number) => {
    const l = lines[ln] ?? "";
    return /^[ \t]*>/u.test(l)
      ? "quoted"
      : /^\t/u.test(l)
        ? "tab"
        : /^ {4,}/u.test(l)
          ? "4+sp"
          : /^ {1,3}\S/u.test(l)
            ? "1-3sp"
            : /^[ \t]*(?:[-*+]|\d{1,9}[.)])/u.test(l)
              ? "marker"
              : "col0";
  };
  const out: string[] = [];
  const wd = new Map(
    (rec.defs ?? []).map((x) => [`${x[0].toLowerCase()}@${x[1]}`, x]),
  );
  const gd = new Map(g.defs.map((x) => [`${x[0].toLowerCase()}@${x[1]}`, x]));
  for (const [k, w] of wd) {
    const m = gd.get(k);
    if (!m) {
      out.push(`def MISSING/${shape(w[1])}`);
      continue;
    }
    if (m[2] !== w[2])
      out.push(
        `def COL${m[2] - w[2] > 0 ? "+" : ""}${m[2] - w[2]}/${shape(w[1])}`,
      );
    if (m[3] !== w[3])
      out.push(
        `def END${m[3] - w[3] > 0 ? "+" : ""}${m[3] - w[3]}/${shape(w[1])}`,
      );
  }
  for (const [k, m] of gd) if (!wd.has(k)) out.push(`def EXTRA/${shape(m[1])}`);
  const wr = new Map(
    (rec.refs ?? [])
      .filter((x) => x[0] !== "")
      .map((x) => [`${x[0].toLowerCase()}@${x[1]}:${x[2]}`, x]),
  );
  const gr = new Map(
    g.refs
      .filter((x) => x[0] !== "")
      .map((x) => [`${x[0].toLowerCase()}@${x[1]}:${x[2]}`, x]),
  );
  for (const [k, w] of wr)
    if (!gr.has(k)) out.push(`ref MISSING/${shape(w[1])}`);
  for (const [k, m] of gr) if (!wr.has(k)) out.push(`ref EXTRA/${shape(m[1])}`);
  return out;
};
const pairs = new Map<string, number>();
const solo = new Map<string, number>();
let two = 0,
  one = 0;
for (const rec of recs) {
  const s = sigOf(rec);
  if (s.length === 1) {
    one++;
    solo.set(s[0]!, (solo.get(s[0]!) ?? 0) + 1);
  }
  if (s.length !== 2) continue;
  two++;
  const k = [...s].sort().join("   +   ");
  pairs.set(k, (pairs.get(k) ?? 0) + 1);
}
console.log(`  ${one} one-error documents, ${two} two-error documents\n`);
console.log("  TOP SOLO SIGNATURES (one fix flips the document outright)");
for (const [k, n] of [...solo].sort((a, b) => b[1] - a[1]).slice(0, 6))
  console.log(`    ${String(n).padStart(3)}  ${k}`);
console.log("\n  TOP PAIRS (both must be fixed for the document to flip)");
for (const [k, n] of [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 8))
  console.log(`    ${String(n).padStart(3)}  ${k}`);
