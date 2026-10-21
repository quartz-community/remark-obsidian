import fs from "node:fs";
import { refereeFactsWithTree } from "./referee-facts.js";
type Rec = {
  id?: string;
  text?: string;
  defs?: [string, number, number, number][];
};
const recs: Rec[] = [];
for (const f of fs
  .readdirSync("/tmp/opencode/of/test/obsidian-answers")
  .sort()) {
  if (!f.endsWith(".json")) continue;
  const d: unknown = JSON.parse(
    fs.readFileSync(`/tmp/opencode/of/test/obsidian-answers/${f}`, "utf8"),
  );
  for (const [i, r] of ((Array.isArray(d) ? d : []) as Rec[]).entries())
    if (r.text) recs.push({ ...r, id: r.id ?? `${f}#${i}` });
}
const sig = new Map<string, { n: number; solo: number; ex: string[] }>();
let docsWrong = 0,
  assertions = 0;
for (const rec of recs) {
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
  const wd = new Map(
    (rec.defs ?? []).map((x) => [`${x[0].toLowerCase()}@${x[1]}`, x]),
  );
  const gd = new Map(g.defs.map((x) => [`${x[0].toLowerCase()}@${x[1]}`, x]));
  const wrong: string[] = [];
  for (const [k, w] of wd) {
    const m = gd.get(k);
    if (!m) {
      wrong.push(`def MISSING/${shape(w[1])}`);
      continue;
    }
    if (m[2] !== w[2])
      wrong.push(
        `def COL${m[2] - w[2] > 0 ? "+" : ""}${m[2] - w[2]}/${shape(w[1])}`,
      );
    if (m[3] !== w[3])
      wrong.push(
        `def END${m[3] - w[3] > 0 ? "+" : ""}${m[3] - w[3]}/${shape(w[1])}`,
      );
  }
  for (const [k, m] of gd)
    if (!wd.has(k)) wrong.push(`def EXTRA/${shape(m[1])}`);
  if (wrong.length === 0) continue;
  docsWrong++;
  assertions += wrong.length;
  for (const w of wrong) {
    const e = sig.get(w) ?? { n: 0, solo: 0, ex: [] };
    e.n++;
    if (wrong.length === 1) {
      e.solo++;
      if (e.ex.length < 1) e.ex.push(rec.id!);
    }
    sig.set(w, e);
  }
}
console.log(
  `  DEFINITIONS only: ${docsWrong} documents wrong, ${assertions} wrong assertions\n`,
);
console.log("  signature                 assertions   solo-docs   example");
for (const [k, v] of [...sig].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) {
  console.log(
    `  ${k.padEnd(26)} ${String(v.n).padStart(6)}      ${String(v.solo).padStart(5)}   ${v.ex[0] ?? ""}`,
  );
}
