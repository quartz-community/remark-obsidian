import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root } from "mdast";
import { loadCorpus } from "./classify.js";
import { factsOf, refereeFacts } from "./referee-facts.js";

const named = (rows: ReadonlyArray<readonly unknown[]>) =>
  rows.filter((row) => row[0] !== "");
const same = (
  a: ReadonlyArray<readonly unknown[]>,
  b: ReadonlyArray<readonly unknown[]>,
) => JSON.stringify(named(a)) === JSON.stringify(named(b));

const stock = unified().use(remarkParse).use(remarkGfm);

let total = 0;
let oursAgree = 0;
let stockAgree = 0;
const regressions: string[] = [];
const weAdd: string[] = [];

for (const a of loadCorpus()) {
  total += 1;
  const pid = (a as unknown as { positionalId: string }).positionalId;
  let ours, st;
  try {
    ours = refereeFacts(a.text);
    st = factsOf(stock.runSync(stock.parse(a.text), a.text) as Root, a.text);
  } catch {
    continue;
  }
  const o = same(ours.defs, a.defs) && same(ours.refs, a.refs);
  const s = same(st.defs, a.defs) && same(st.refs, a.refs);
  if (o) oursAgree += 1;
  if (s) stockAgree += 1;
  if (s && !o) regressions.push(pid);
  if (o && !s) weAdd.push(pid);
}

console.log(`documents            ${String(total)}`);
console.log(
  `CONTROL ours agree   ${String(oursAgree)}   (referee says 6251 -- must match)`,
);
console.log(`stock agrees         ${String(stockAgree)}`);
console.log(
  `SELF-INFLICTED       ${String(regressions.length)}   stock agrees, we do NOT`,
);
console.log(
  `we add value         ${String(weAdd.length)}   we agree, stock does not`,
);
console.log("--- self-inflicted ids ---");
for (const r of regressions) console.log(`  ${r}`);
