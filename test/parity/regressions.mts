import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root } from "mdast";

import { loadCorpus } from "./classify.js";
import { factsOf, refereeFacts } from "./referee-facts.js";

/**
 * Which documents does THIS PACKAGE break that stock `remark-parse` + `remark-gfm`
 * already gets right?
 *
 * Every other instrument here is organised by Obsidian rule, so a divergence we
 * introduced ourselves is invisible to them: it belongs to no family, because no
 * Obsidian rule is missing. This one is organised by BLAME. A document where stock
 * agrees and we do not is a regression one of our ~97 passes caused, which makes it
 * an EXCLUSION rather than a feature -- the cheapest class of fix in the package.
 *
 *     npx tsx --conditions=development test/parity/regressions.mts
 *     npx tsx --conditions=development test/parity/regressions.mts --ids
 *     npx tsx --conditions=development test/parity/regressions.mts --self-test
 *
 * `--ids` prints the self-inflicted ids alone, because this harness's standing rule
 * is to diff identities rather than totals.
 *
 * THE AGREEMENT TEST IS REPLICATED FROM `referee.mts` AND MUST BE VALIDATED, NOT
 * TRUSTED. Stock has to be projected through the same test the referee applies to
 * us, and there is no way to do that without restating it -- but reimplementing
 * that test has disagreed with the oracle four times in this effort. So
 * `--self-test` runs the control: applying it to OUR facts must reproduce the
 * referee's own agreeing count. If that number drifts from what `referee.mts`
 * prints, this instrument is wrong and its population means nothing.
 *
 * Two details the restatement depends on. `named()` drops rows whose name is the
 * empty string, and the compare is an ORDERED `JSON.stringify` -- not a set, and
 * not a sort. And a `Def` is a FOUR-tuple, so comparing name/line/column silently
 * ignores its fourth field, which is one of the ways the four earlier attempts
 * went wrong.
 *
 * Stock is projected with `factsOf`, which `referee-facts.ts` exports for exactly
 * this: "a caller holding a tree built with NON-DEFAULT flags can project it the
 * same way".
 */
const named = (rows: ReadonlyArray<readonly unknown[]>) =>
  rows.filter((row) => row[0] !== "");

const same = (
  a: ReadonlyArray<readonly unknown[]>,
  b: ReadonlyArray<readonly unknown[]>,
) => JSON.stringify(named(a)) === JSON.stringify(named(b));

const stock = unified().use(remarkParse).use(remarkGfm);

const idsOnly = process.argv.includes("--ids");
const selfTest = process.argv.includes("--self-test");

let total = 0;
let oursAgree = 0;
let stockAgree = 0;
const selfInflicted: string[] = [];
const weAdd: string[] = [];

for (const answer of loadCorpus()) {
  total += 1;
  const id = (answer as unknown as { positionalId: string }).positionalId;

  let ours;
  let theirs;
  try {
    ours = refereeFacts(answer.text);
    theirs = factsOf(
      stock.runSync(stock.parse(answer.text), answer.text) as Root,
      answer.text,
    );
  } catch {
    continue;
  }

  const weMatch = same(ours.defs, answer.defs) && same(ours.refs, answer.refs);
  const theyMatch =
    same(theirs.defs, answer.defs) && same(theirs.refs, answer.refs);

  if (weMatch) oursAgree += 1;
  if (theyMatch) stockAgree += 1;
  if (theyMatch && !weMatch) selfInflicted.push(id);
  if (weMatch && !theyMatch) weAdd.push(id);
}

if (idsOnly) {
  for (const id of selfInflicted) console.log(id);
} else {
  console.log(`documents                ${String(total)}`);
  console.log(`ours agree               ${String(oursAgree)}`);
  console.log(`stock agrees             ${String(stockAgree)}`);
  console.log(
    `SELF-INFLICTED           ${String(selfInflicted.length)}  stock agrees, we do not`,
  );
  console.log(
    `we add value             ${String(weAdd.length)}  we agree, stock does not`,
  );
  for (const id of selfInflicted) console.log(`  ${id}`);
}

if (selfTest) {
  const expected = Number(process.env.PARITY_REFEREE_AGREE ?? "6252");
  const ok = oursAgree === expected;
  console.log(
    `\nself-test: ours agree ${String(oursAgree)} vs referee ${String(expected)} -- ${ok ? "OK" : "MISMATCH"}`,
  );
  if (!ok) {
    console.log(
      "  The replicated agreement test no longer matches the referee, so the",
      "\n  population above is meaningless. Re-read `same`/`named` in referee.mts,",
      "\n  or pass the current figure as PARITY_REFEREE_AGREE.",
    );
    process.exitCode = 1;
  }
}
