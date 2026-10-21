import fs from "node:fs";
import { refereeFactsWithTree } from "./referee-facts.js";
type Rec = { id?: string; text?: string; defs?: [string, number, number, number][]; refs?: [string, number, number][] };
const recs: Rec[] = [];
for (const f of fs.readdirSync("/tmp/opencode/of/test/obsidian-answers").sort()) {
  if (!f.endsWith(".json")) continue;
  const d: unknown = JSON.parse(fs.readFileSync(`/tmp/opencode/of/test/obsidian-answers/${f}`, "utf8"));
  for (const r of (Array.isArray(d) ? d : []) as Rec[]) if (r.text) recs.push(r);
}
// one entry per WRONG ASSERTION, keyed by its own signature
const kinds = new Map<string, number>();
const soloKinds = new Map<string, number>();
for (const rec of recs) {
  const g = refereeFactsWithTree(rec.text!);
  const lines = rec.text!.split("\n");
  const shape = (ln: number) => {
    const l = lines[ln] ?? "";
    return /^[ \t]*>/u.test(l) ? "quoted" : /^\t/u.test(l) ? "tab" : /^ {4,}/u.test(l) ? "4+sp"
      : /^ {1,3}\S/u.test(l) ? "1-3sp" : /^[ \t]*(?:[-*+]|\d{1,9}[.)])/u.test(l) ? "marker" : "col0";
  };
  const wd = new Map((rec.defs ?? []).map((x) => [`${x[0].toLowerCase()}@${x[1]}`, x]));
  const gd = new Map(g.defs.map((x) => [`${x[0].toLowerCase()}@${x[1]}`, x]));
  const wrong: string[] = [];
  for (const [k, w] of wd) {
    const m = gd.get(k);
    if (!m) { wrong.push(`def MISSING / ${shape(w[1])}`); continue; }
    if (m[2] !== w[2]) wrong.push(`def COLUMN ${m[2] - w[2] > 0 ? "+" : ""}${m[2] - w[2]} / ${shape(w[1])}`);
    if (m[3] !== w[3]) wrong.push(`def END ${m[3] - w[3] > 0 ? "+" : ""}${m[3] - w[3]} / ${shape(w[1])}`);
  }
  for (const [k, m] of gd) if (!wd.has(k)) wrong.push(`def EXTRA / ${shape(m[1])}`);
  const wr = new Map((rec.refs ?? []).filter((x) => x[0] !== "").map((x) => [`${x[0].toLowerCase()}@${x[1]}:${x[2]}`, x]));
  const gr = new Map(g.refs.filter((x) => x[0] !== "").map((x) => [`${x[0].toLowerCase()}@${x[1]}:${x[2]}`, x]));
  for (const [k, w] of wr) if (!gr.has(k)) wrong.push(`ref MISSING / ${shape(w[1])}`);
  for (const [k, m] of gr) if (!wr.has(k)) wrong.push(`ref EXTRA / ${shape(m[1])}`);
  for (const w of wrong) kinds.set(w, (kinds.get(w) ?? 0) + 1);
  if (wrong.length === 1) soloKinds.set(wrong[0]!, (soloKinds.get(wrong[0]!) ?? 0) + 1);
}
const tot = [...kinds.values()].reduce((a, b) => a + b, 0);
console.log(`  ${tot} wrong assertions, ${kinds.size} distinct signatures\n`);
console.log("  TOP SIGNATURES (count = assertions; solo = documents where it is the ONLY error)");
for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 14)) {
  console.log(`    ${String(n).padStart(4)}  solo ${String(soloKinds.get(k) ?? 0).padStart(3)}  ${k}`);
}
