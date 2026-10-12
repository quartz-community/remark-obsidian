/**
 * Score a candidate RULE against all 6,818 referee documents before implementing it.
 *
 *     PARITY_REFEREE_DIR=/tmp/of/test/obsidian-answers \
 *       npx tsx --conditions=development test/parity/score.mts [name]
 *
 * This exists because of a measured pattern in how work on this package succeeds and fails.
 * Every change that landed extended an already-measured rule to a new input class --
 * `referenceLinks` was right on 110 of 111 cases before a line of it was wired in, the
 * container-lazy fix added two entries to an existing guard list, the definition-column rule
 * gained a second node type. Every change that was refused added a NEW REPAIR for a single
 * observed shape, and each scored `+1 corpus case` against `-4` to `-27` referee documents.
 *
 * That is structural rather than unlucky: a repair that fires on one shape fires on many
 * shapes in documents carrying six or eight constructs, so the blast radius is always larger
 * than the thing measured. The standing rule here is to measure a predicate on both sides
 * before implementing, and it was being applied to CASES rather than to the implementation's
 * blast radius -- the tab work cost three implementation cycles and the comment fold four to
 * reach conclusions this scoring gives in one.
 *
 * So a rule is written as a transformation of OUR OWN ANSWERS, not as a pass. It needs no
 * tree surgery, no pass ordering, and no re-parse, and it cannot be keyed wrong the way a
 * disagreement table can -- the scoring applies it to every document and asks only whether
 * each document moved toward the recorded answer or away from it.
 *
 * Implement a rule only when it is net-positive here. A rule that is CORRECT and scores
 * negative is a real outcome: record it with its score and leave it, rather than retrying it
 * at a different scope, which is what three tab scopings and four comment-fold iterations
 * each established the hard way.
 *
 * The two rules below are the two most recently refused, kept as the harness's own control:
 * it has to reproduce their known scores, or it is not measuring what it claims. It does --
 * `quote-truncate` scores 61 better against 351 worse where implementing it measured the
 * same sign at entry level, and `comment-fold` drops agreement by 3 where the built version
 * measured 4.
 *
 * And it reports something no implementation measurement can: a rule's CEILING. `comment-fold`
 * changes 38 documents of 6,818, so its best possible outcome was +9 -- four implementation
 * cycles were spent on a rule that could never have been worth more than that. Read the
 * `better + worse + same` total first: if it is small, the rule is not worth building however
 * the sign comes out.
 */
import fs from "node:fs";
import path from "node:path";

import { refereeFacts, type Def, type Ref } from "./referee-facts.js";

interface Answer {
  readonly text: string;
  readonly defs: readonly Def[];
  readonly refs: readonly Ref[];
}

interface Facts {
  readonly defs: readonly Def[];
  readonly refs: readonly Ref[];
}

/** A candidate rule: our facts in, our facts out. Never touches the tree. */
interface Rule {
  readonly name: string;
  readonly what: string;
  readonly apply: (text: string, ours: Facts) => Facts;
}

const QUOTE_PREFIX = /^[ \t]*>/u;
const COMMENT_LINE = /^[ \t>]*%%/u;

const RULES: readonly Rule[] = [
  {
    name: "quote-truncate",
    what: "a definition ends before the first quote-prefixed line inside it",
    apply: (text, ours) => {
      const lines = text.split("\n");
      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          for (let line = d[1] + 1; line <= d[3]; line++) {
            if (QUOTE_PREFIX.test(lines[line] ?? "")) {
              return [d[0], d[1], d[2], line - 1];
            }
          }
          return d;
        }),
      };
    },
  },
  {
    name: "comment-fold",
    what: "a definition absorbs an adjacent following comment's lines",
    apply: (text, ours) => {
      const lines = text.split("\n");
      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          let end = d[3];
          // Only while the next line opens a comment and nothing blank intervenes, which is
          // the adjacency the pass itself tests.
          while (
            COMMENT_LINE.test(lines[end + 1] ?? "") &&
            (lines[end + 1] ?? "").trim() !== ""
          ) {
            end += 1;
            while (
              (lines[end + 1] ?? "").trim() !== "" &&
              end + 1 < lines.length
            ) {
              end += 1;
            }
          }
          return [d[0], d[1], d[2], end];
        }),
      };
    },
  },
];

const dir =
  process.env.PARITY_REFEREE_DIR ??
  "/tmp/obsidian-footnotes/test/obsidian-answers";
if (!fs.existsSync(dir)) {
  console.log(`score: no corpus at ${dir}`);
  process.exit(0);
}

const answers: Answer[] = [];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const raw: unknown = JSON.parse(
    fs.readFileSync(path.join(dir, file), "utf8"),
  );
  const list = Array.isArray(raw)
    ? raw
    : Object.values(raw as Record<string, unknown>);
  for (const value of list as Answer[]) answers.push(value);
}

const key = (rows: readonly (readonly unknown[])[]) =>
  JSON.stringify(rows.map((row) => JSON.stringify(row)).sort());

/** How far a set of facts is from the recorded answer: entries missing plus entries extra. */
function distance(ours: Facts, answer: Answer): number {
  const want = new Set([
    ...answer.defs.map((d) => `d${JSON.stringify(d)}`),
    ...answer.refs.map((r) => `r${JSON.stringify(r)}`),
  ]);
  const have = new Set([
    ...ours.defs.map((d) => `d${JSON.stringify(d)}`),
    ...ours.refs.map((r) => `r${JSON.stringify(r)}`),
  ]);
  let apart = 0;
  for (const entry of want) if (!have.has(entry)) apart += 1;
  for (const entry of have) if (!want.has(entry)) apart += 1;
  return apart;
}

const wanted = process.argv[2];
console.log(`score: ${answers.length} documents\n`);

for (const rule of RULES) {
  if (wanted !== undefined && rule.name !== wanted) continue;
  let better = 0;
  let worse = 0;
  let same = 0;
  let untouched = 0;
  let agreedBefore = 0;
  let agreedAfter = 0;

  for (const answer of answers) {
    let ours: Facts;
    try {
      ours = refereeFacts(answer.text);
    } catch {
      continue;
    }
    const after = rule.apply(answer.text, ours);
    const unchanged =
      key(ours.defs) === key(after.defs) && key(ours.refs) === key(after.refs);
    const before = distance(ours, answer);
    const now = distance(after, answer);
    if (before === 0) agreedBefore += 1;
    if (now === 0) agreedAfter += 1;
    if (unchanged) {
      untouched += 1;
      continue;
    }
    if (now < before) better += 1;
    else if (now > before) worse += 1;
    else same += 1;
  }

  const verdict = better > worse ? "NET POSITIVE" : "net negative";
  console.log(`  ${rule.name}  --  ${rule.what}`);
  console.log(
    `    documents it changes : better ${better}  worse ${worse}  same ${same}` +
      `   (untouched ${untouched})`,
  );
  console.log(
    `    documents in full agreement : ${agreedBefore} -> ${agreedAfter}   ${verdict}\n`,
  );
}
