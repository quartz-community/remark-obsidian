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

import type { Root } from "mdast";

import { refereeFactsWithTree, type Def, type Ref } from "./referee-facts.js";

interface Answer {
  readonly text: string;
  readonly defs: readonly Def[];
  readonly refs: readonly Ref[];
}

interface Facts {
  readonly defs: readonly Def[];
  readonly refs: readonly Ref[];
}

/**
 * A candidate rule: our facts in, our facts out, with the TREE to read.
 *
 * The tree is passed because it is already parsed -- `refereeFacts` built it and used to
 * discard it -- and because without it no rule needing container state can be expressed. The
 * first version withheld it on the reasoning that a scored rule should need "no tree
 * surgery", which conflated READING the tree with MUTATING it. Only the second is
 * order-dependent, and a rule here still does neither: it returns facts.
 *
 * That omission cost four scopings of one candidate, each approximating "this line continues
 * that item" with a backward line scan and each scoring well on distance and badly on
 * agreement -- the signature of a rule whose shape is right and whose boundary needs state a
 * scan does not have.
 */
interface Rule {
  readonly name: string;
  readonly what: string;
  readonly apply: (text: string, ours: Facts, tree: Root) => Facts;
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
    name: "tab-marker-defines-tree",
    what: "a label our parser made CODE inside a tab-separated item defines, at marker+1",
    apply: (text, ours, tree) => {
      // The tree version of `tab-marker-defines`, whose line-scan form capped at ten
      // documents. The scan had to guess whether a label was nested, fenced, or inside an
      // item; the tree knows exactly, because the shape this rule is about is a `code` node
      // sitting INSIDE a `listItem` whose marker separator holds a tab -- that is what
      // micromark produces for `+⇥   [^1]: def` and it is why no definition is reported.
      const extra: Def[] = [];
      const walk = (node: unknown): void => {
        const self = node as {
          type?: string;
          position?: {
            start: { line: number; column: number; offset?: number };
          };
          children?: unknown[];
        };
        if (self.type === "listItem") {
          const from = self.position?.start?.offset;
          if (from !== undefined) {
            const bol = text.lastIndexOf("\n", from - 1) + 1;
            const nl = text.indexOf("\n", from);
            const line = text.slice(bol, nl === -1 ? undefined : nl);
            const marker = TAB_MARKER.exec(line);
            if (marker && marker[2]!.startsWith("\t")) {
              for (const kid of (self.children ?? []) as Array<{
                type?: string;
                position?: { start: { line: number; offset?: number } };
              }>) {
                if (kid.type !== "code") continue;
                const at = kid.position?.start?.offset;
                if (at === undefined) continue;
                const kbol = text.lastIndexOf("\n", at - 1) + 1;
                const knl = text.indexOf("\n", at);
                const kline = text.slice(kbol, knl === -1 ? undefined : knl);
                const label = LABEL.exec(kline.replace(TAB_MARKER, ""));
                if (!label) continue;
                const row = kid.position!.start.line - 1;
                if (ours.defs.some((d) => d[1] === row)) continue;
                // The end absorbs following non-blank lines, which is the measured
                // continuation rule. Using the label's own line put the end one short --
                // the answer says 8 where that gave 7 -- and that accounted for most of the
                // documents this made worse.
                const lines = text.split("\n");
                let end = row;
                while (
                  end + 1 < lines.length &&
                  (lines[end + 1] ?? "").trim() !== ""
                ) {
                  end += 1;
                }
                extra.push([
                  (label[1] ?? "").toLowerCase(),
                  row,
                  marker[1]!.length + 1,
                  end,
                ]);
              }
            }
          }
        }
        for (const kid of self.children ?? []) walk(kid);
      };
      walk(tree);
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
        // The QUOTE RUN only. Stripping the list marker too looks like the obvious next
        // step -- a fence opened as `> 1.    ``` ` reads as four columns of indent otherwise
        // -- and it scores WORSE: 32 better against 32 worse becomes 84 against 100, because
        // it then finds fences on lines that are not fences and drops definitions that
        // should stay. The detection has a sweet spot and this is past it.
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
    name: "lazy-after-list-tree",
    what: "a root definition reachable back to a list with no blank line is swallowed",
    apply: (text, ours, tree) => {
      // The same rule as `drop-defs-after-list-code`, asked of the TREE instead of a
      // backward line scan. The scan could not tell whether the item was still open, and
      // every document it got wrong was a column-0 definition after indented content where
      // the item had in fact closed. The tree knows: a definition that should have been
      // absorbed is a ROOT sibling of the list, reachable back to it across siblings with no
      // blank line between any pair.
      const kids = tree.children;
      const gapIsBlank = (from: number, to: number) =>
        text.slice(from, to).includes("\n\n");
      const swallowed = new Set<number>();
      for (const [index, child] of kids.entries()) {
        if (child.type !== "footnoteDefinition") continue;
        const start = child.position?.start;
        if (!start || start.column !== 1) continue;
        let at = index - 1;
        let edge = child.position?.start?.offset;
        while (at >= 0) {
          const prev = kids[at]!;
          const prevEnd = prev.position?.end?.offset;
          if (prevEnd === undefined || edge === undefined) break;
          if (gapIsBlank(prevEnd, edge)) break;
          if (prev.type === "list") {
            swallowed.add(start.line - 1);
            break;
          }
          edge = prev.position?.start?.offset;
          at -= 1;
        }
      }
      return {
        refs: ours.refs,
        defs: ours.defs.filter((d) => !swallowed.has(d[1])),
      };
    },
  },
  {
    name: "lazy-after-any-container",
    what: "...and the same reaching back to a quote or callout, not only a list",
    apply: (text, ours, tree) => {
      // The generalisation of `lazy-after-list-tree`, which landed at +43 documents for
      // lists. If a definition reachable back to a LIST is swallowed by it, the question is
      // whether a quote or a callout behaves the same way -- the containers
      // `containerLazyTransform` already treats alike everywhere else.
      const containers = new Set(["list", "blockquote", "callout"]);
      const kids = tree.children;
      const swallowed = new Set<number>();
      for (const [index, child] of kids.entries()) {
        if (child.type !== "footnoteDefinition") continue;
        const start = child.position?.start;
        if (!start || start.column !== 1) continue;
        let at = index - 1;
        let edge = start.offset;
        while (at >= 0) {
          const prev = kids[at]!;
          const prevEnd = prev.position?.end?.offset;
          if (prevEnd === undefined || edge === undefined) break;
          if (text.slice(prevEnd, edge).includes("\n\n")) break;
          if (containers.has(prev.type)) {
            swallowed.add(start.line - 1);
            break;
          }
          edge = prev.position?.start?.offset;
          at -= 1;
        }
      }
      return {
        refs: ours.refs,
        defs: ours.defs.filter((d) => !swallowed.has(d[1])),
      };
    },
  },
  {
    name: "drop-defs-after-list-code",
    what: "a definition after a list+code run with no blank line is swallowed by the list",
    apply: (text, ours) => {
      const lines = text.split("\n");
      // The NARROW version, and the broad one was wrong. `- a` / `lazy` / `[^1]: def`
      // already works here -- `containerLazyTransform` absorbs the plain lazy line and the
      // definition with it -- so a rule dropping every column-0 definition after an item
      // was covering cases that already pass. The real gap is the F5 control: a
      // tab-indented `%%` after a list becomes a ROOT `code` node, which breaks the
      // absorption chain, and the definition below it is then reported where Obsidian
      // swallows it. The shape is `list`, then an indented line, then the label, with no
      // blank line anywhere between.
      const swallowed = new Set<number>();
      for (const [index, line] of lines.entries()) {
        // Column 0 only: lazy continuation is by definition an UNINDENTED line. An
        // indented label inside the item is a real definition there, and dropping those is
        // what cost the previous scoping its agreement -- it removed labels at columns 1
        // and 3 that the answer holds.
        if (!/^\[\^[^\]]*\]:/u.test(line) || index < 2) continue;
        const above = lines[index - 1] ?? "";
        if (above.trim() === "" || !/^[ \t]/u.test(above)) continue;
        // Walk back over indented lines to a list marker, stopping at any blank.
        let at = index - 1;
        while (at > 0 && /^[ \t]/u.test(lines[at] ?? "")) at -= 1;
        if (/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]/u.test(lines[at] ?? "")) {
          swallowed.add(index);
        }
      }
      return {
        refs: ours.refs,
        defs: ours.defs.filter((d) => !swallowed.has(d[1])),
      };
    },
  },
  {
    name: "drop-defs-lazy-after-item",
    what: "a column-0 definition lazily continuing a list item is not a definition",
    apply: (text, ours) => {
      const lines = text.split("\n");
      // Traced from `obsidian-footnotes`' rule F5 and its three controls, each confirmed
      // against live Obsidian: `1. p` / `  10.     q` / `⇥%%` / `[^1]: def` reports NO
      // definition, and the same with six spaces or with plain text in place of the `%%`
      // also reports none -- the item's content continues and the column-0 label is lazy
      // continuation rather than a definition. Only the four-space `%%` ends the list, which
      // is F5 itself and which we already get right.
      // Lazy continuation proper: the item's content has to still be an OPEN PARAGRAPH on
      // the line before, and the label itself has to sit at column 0. The crude version --
      // everything after a marker until a blank line -- scored 160 better against 161 worse
      // because it counted frontmatter and quoted content as item continuation.
      // Frontmatter is not a list. A leading `---` block holding `tags:` / `  - test`
      // opened the tracker on the YAML sequence item and dropped every definition below it;
      // that was most of the 45 the previous scoping made worse.
      let body = 0;
      if (lines[0]?.trim() === "---") {
        for (let line = 1; line < lines.length; line++) {
          if (lines[line]?.trim() === "---") {
            body = line + 1;
            break;
          }
        }
      }
      const inItem = new Set<number>();
      let open = false;
      let prevWasContent = false;
      for (const [index, line] of lines.entries()) {
        if (index < body) continue;
        if (line.trim() === "") {
          open = false;
          prevWasContent = false;
          continue;
        }
        if (/^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]/u.test(line)) {
          open = true;
          prevWasContent = true;
          continue;
        }
        // A container prefix of its own means the line belongs to something else.
        if (/^[ \t]*>/u.test(line)) {
          open = false;
          prevWasContent = false;
          continue;
        }
        if (open && prevWasContent && !/^[ \t]/u.test(line)) inItem.add(index);
        prevWasContent = open;
      }
      return {
        refs: ours.refs,
        defs: ours.defs.filter((d) => !inItem.has(d[1])),
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
    let ours: Facts & { tree: Root };
    try {
      ours = refereeFactsWithTree(answer.text);
    } catch {
      continue;
    }
    const after = rule.apply(answer.text, ours, ours.tree);
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
