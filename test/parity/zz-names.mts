import fs from "node:fs";
import { refereeFactsWithTree } from "./referee-facts.js";
type Rec = {
  id?: string;
  text?: string;
  defs?: [string, number, number, number][];
  refs?: [string, number, number][];
};
const recs: Rec[] = [];
for (const f of fs.readdirSync("/tmp/opencode/corrected-answers").sort()) {
  if (!f.endsWith(".json")) continue;
  const d: unknown = JSON.parse(
    fs.readFileSync(`/tmp/opencode/corrected-answers/${f}`, "utf8"),
  );
  for (const [i, r] of ((Array.isArray(d) ? d : []) as Rec[]).entries())
    if (r.text) recs.push({ ...r, id: r.id ?? `${f}#${i}` });
}
const counter = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};
const diff = (want: Map<string, number>, got: Map<string, number>) => {
  const extra: string[] = [],
    missing: string[] = [];
  for (const [k, n] of got) {
    const d = n - (want.get(k) ?? 0);
    for (let i = 0; i < d; i++) extra.push(k);
  }
  for (const [k, n] of want) {
    const d = n - (got.get(k) ?? 0);
    for (let i = 0; i < d; i++) missing.push(k);
  }
  return { extra, missing };
};
const bucket = new Map<string, { docs: number; a: number; ex: string[] }>();
const ids: string[] = [];
let docs = 0,
  totalExtra = 0,
  totalMissing = 0;
for (const rec of recs) {
  const g = refereeFactsWithTree(rec.text!);
  const want = counter([
    ...(rec.defs ?? []).map((x) => `d:${x[0].toLowerCase()}`),
    ...(rec.refs ?? []).map((x) => `r:${x[0].toLowerCase()}`),
  ]);
  const got = counter([
    ...g.defs.map((x) => `d:${x[0].toLowerCase()}`),
    ...g.refs.map((x) => `r:${x[0].toLowerCase()}`),
  ]);
  const { extra, missing } = diff(want, got);
  if (extra.length === 0 && missing.length === 0) continue;
  docs++;
  ids.push(rec.id!);
  totalExtra += extra.length;
  totalMissing += missing.length;
  const kinds = new Set<string>();
  for (const e of extra)
    kinds.add(`EXTRA ${e.startsWith("d:") ? "def" : "ref"}`);
  for (const m of missing)
    kinds.add(`MISSING ${m.startsWith("d:") ? "def" : "ref"}`);
  // is it a straight swap of the same name between dimensions? (the cascade)
  const swap =
    extra.length === 1 &&
    missing.length === 1 &&
    extra[0]!.slice(2) === missing[0]!.slice(2) &&
    extra[0]![0] !== missing[0]![0];
  const key = swap
    ? "CASCADE: same name, def<->ref swapped"
    : [...kinds].sort().join(" + ");
  const e = bucket.get(key) ?? { docs: 0, a: 0, ex: [] };
  e.docs++;
  e.a += extra.length + missing.length;
  if (e.ex.length < 2)
    e.ex.push(
      `${rec.id} extra=${JSON.stringify(extra)} missing=${JSON.stringify(missing)}`,
    );
  bucket.set(key, e);
}
fs.writeFileSync("/tmp/opencode/name-div-ids.txt", ids.join("\n") + "\n");
console.log(
  `  NAME-DIMENSION divergences: ${docs} documents, ${totalExtra} extra names, ${totalMissing} missing names\n`,
);
console.log("  bucket                                          docs   names");
for (const [k, v] of [...bucket]
  .sort((a, b) => b[1].docs - a[1].docs)
  .slice(0, 10)) {
  console.log(
    `  ${k.padEnd(46)} ${String(v.docs).padStart(5)} ${String(v.a).padStart(7)}`,
  );
  for (const x of v.ex) console.log(`        ${x.slice(0, 96)}`);
}
console.log(`\n  ids -> /tmp/opencode/name-div-ids.txt`);
