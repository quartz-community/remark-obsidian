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
/** A marker whose separator run holds a tab, then a label. Split to keep the lint happy. */
const TAB_MARKER = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)]))([ \t]*)/u;
const LABEL = /^\[\^([^\]]*)\]:/u;

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
  {
    name: "tab-marker-defines",
    what: "a label behind a marker whose separator holds a tab defines, at marker+1",
    apply: (text, ours) => {
      const lines = text.split("\n");
      const extra: Def[] = [];
      for (const [index, line] of lines.entries()) {
        const marker = TAB_MARKER.exec(line);
        if (!marker || !marker[2]!.includes("\t")) continue;
        const label = LABEL.exec(line.slice(marker[0].length));
        if (!label) continue;
        if (ours.defs.some((d) => d[1] === index)) continue;
        // Column is the marker plus ONE, the measured rule for a tab separator: `+⇥   [^1]:
        // def` is column 2 and `1.⇥   [^1]: def` is column 3.
        //
        // The END absorbs every following non-blank line, which is the other measured rule
        // -- a definition runs to the blank line whatever the lines hold. Scoring the
        // label's own line instead gave `better 23 worse 114 same 1`, and a `same` of one
        // against 114 worse is the tell that the end was wrong rather than the rule: every
        // added definition counted as both a missing entry and an extra one.
        let end = index;
        while (end + 1 < lines.length && (lines[end + 1] ?? "").trim() !== "") {
          end += 1;
        }
        extra.push([
          (label[1] ?? "").toLowerCase(),
          index,
          marker[1]!.length + 1,
          end,
        ]);
      }
      return extra.length === 0
        ? ours
        : { defs: [...ours.defs, ...extra], refs: ours.refs };
    },
  },
  {
    name: "tab-marker-defines-root",
    what: "...and only when the marker itself sits at column 0",
    apply: (text, ours) => {
      const lines = text.split("\n");
      const extra: Def[] = [];
      // Fence interiors are not a tab question at all: `\`\`\`\`` opened and never closed
      // puts every later line in code, and a label there defines nothing. One of the three
      // documents the previous scoping made worse was exactly that.
      const fenced = new Set<number>();
      let open = false;
      for (const [index, line] of lines.entries()) {
        if (/^[ \t>]*(?:```|~~~)/u.test(line)) {
          open = !open;
          fenced.add(index);
          continue;
        }
        if (open) fenced.add(index);
      }
      for (const [index, line] of lines.entries()) {
        if (fenced.has(index)) continue;
        const marker = TAB_MARKER.exec(line);
        if (!marker || !marker[2]!.includes("\t")) continue;
        // Two further narrowings, each from a document the looser rule makes worse.
        //
        // The marker sits at column 0: every example of the unrestricted rule going wrong
        // adds a definition behind an INDENTED marker, `  2)⇥[^Note]:` nested in another
        // item, while every shape the rule was measured on had its marker at column 0.
        //
        // And the separator STARTS with the tab. `+ ⇥[^Ω]: Text` defines nothing, which was
        // measured directly as probe 3 of the first batch -- a tab AFTER a space does not
        // behave like one immediately after the marker, and `[ \t]*` matched both.
        if (/^[ \t]/u.test(line)) continue;
        if (!marker[2]!.startsWith("\t")) continue;
        const label = LABEL.exec(line.slice(marker[0].length));
        if (!label) continue;
        if (ours.defs.some((d) => d[1] === index)) continue;
        let end = index;
        while (end + 1 < lines.length && (lines[end + 1] ?? "").trim() !== "") {
          end += 1;
        }
        extra.push([
          (label[1] ?? "").toLowerCase(),
          index,
          marker[1]!.length + 1,
          end,
        ]);
      }
      return extra.length === 0
        ? ours
        : { defs: [...ours.defs, ...extra], refs: ours.refs };
    },
  },
  {
    name: "drop-defs-in-fence",
    what: "a definition inside a fenced block is not a definition (CommonMark fences)",
    apply: (text, ours) => {
      const lines = text.split("\n");
      const fenced = new Set<number>();
      // CommonMark's rules, not a toggle on any backtick run. A closer has to use the SAME
      // character, be at least as long as the opener, and carry no info string -- and an
      // opener indented four or more columns past its container is indented code rather
      // than a fence. The naive toggle scored 103 better against 137 worse; every one of
      // those 137 is a line this mis-classifies.
      let fence: { char: string; size: number } | undefined;
      for (const [index, line] of lines.entries()) {
        const bare = line.replace(/^(?:[ \t]*>)*/u, "");
        const run = /^([ \t]*)(`{3,}|~{3,})([^`~]*)$/u.exec(bare);
        if (fence === undefined) {
          if (
            run &&
            (run[1] ?? "").replace(/\t/gu, "    ").length < 4 &&
            run[2]!.startsWith("`") === (run[2]![0] === "`")
          ) {
            fence = { char: run[2]![0]!, size: run[2]!.length };
            fenced.add(index);
          }
          continue;
        }
        fenced.add(index);
        if (
          run &&
          run[2]![0] === fence.char &&
          run[2]!.length >= fence.size &&
          (run[3] ?? "").trim() === ""
        ) {
          fence = undefined;
        }
      }
      return {
        refs: ours.refs,
        defs: ours.defs.filter((d) => !fenced.has(d[1])),
      };
    },
  },
  {
    name: "drop-defs-in-comment",
    what: "a definition inside an open `%%` span is not a definition",
    apply: (text, ours) => {
      const lines = text.split("\n");
      const buried = new Set<number>();
      let open = false;
      for (const [index, line] of lines.entries()) {
        const marks = (line.match(/%%/gu) ?? []).length;
        if (open && marks === 0) buried.add(index);
        for (let n = 0; n < marks; n++) open = !open;
      }
      return {
        refs: ours.refs,
        defs: ours.defs.filter((d) => !buried.has(d[1])),
      };
    },
  },
  {
    name: "defs-end-before-opener",
    what: "a definition ends before a following column-0 block opener",
    apply: (text, ours) => {
      const lines = text.split("\n");
      const opener =
        /^(?:#{1,6} |```|~~~|\[\^[^\]]*\]:|---|===|___|\*\*\*|%%)/u;
      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          for (let line = d[1] + 1; line <= d[3]; line++) {
            if (opener.test(lines[line] ?? ""))
              return [d[0], d[1], d[2], line - 1];
          }
          return d;
        }),
      };
    },
  },
  {
    name: "refs-add-bare",
    what: "every `[^name]` outside a label is a reference we may be missing",
    apply: (text, ours) => {
      const lines = text.split("\n");
      const extra: Ref[] = [];
      for (const [index, line] of lines.entries()) {
        for (const hit of line.matchAll(/\[\^([^\]]+)\](?!:)/gu)) {
          const column = hit.index ?? 0;
          const name = (hit[1] ?? "").toLowerCase();
          if (ours.refs.some((r) => r[1] === index && r[2] === column))
            continue;
          extra.push([name, index, column]);
        }
      }
      return extra.length === 0
        ? ours
        : { defs: ours.defs, refs: [...ours.refs, ...extra] };
    },
  },
  {
    name: "refs-drop-undefined",
    what: "a reference whose name has no definition is not reported",
    apply: (_text, ours) => {
      const named = new Set(ours.defs.map((d) => d[0].toLowerCase()));
      return {
        defs: ours.defs,
        refs: ours.refs.filter((r) => named.has(r[0].toLowerCase())),
      };
    },
  },
  {
    name: "tab-marker-column",
    what: "a definition we already place behind a tab separator sits at marker+1",
    apply: (text, ours) => {
      const lines = text.split("\n");
      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          const marker = TAB_MARKER.exec(lines[d[1]] ?? "");
          if (!marker || !marker[2]!.includes("\t")) return d;
          const want = marker[1]!.length + 1;
          return want === d[2] ? d : [d[0], d[1], want, d[3]];
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
  // A few documents the rule makes WORSE, which is what says whether the rule is wrong or
  // its approximation is. Three is enough to tell those apart and short enough to read.
  const examples: string[] = [];

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
    else if (now > before) {
      worse += 1;
      if (examples.length < 3) {
        examples.push(
          `${JSON.stringify(answer.text).slice(0, 96)}\n        answer=${JSON.stringify(answer.defs)}\n        after =${JSON.stringify(after.defs)}`,
        );
      }
    } else same += 1;
  }

  const verdict = better > worse ? "NET POSITIVE" : "net negative";
  console.log(`  ${rule.name}  --  ${rule.what}`);
  console.log(
    `    documents it changes : better ${better}  worse ${worse}  same ${same}` +
      `   (untouched ${untouched})`,
  );
  console.log(
    `    documents in full agreement : ${agreedBefore} -> ${agreedAfter}   ${verdict}`,
  );
  for (const example of examples) console.log(`      worse: ${example}`);
  console.log("");
}
