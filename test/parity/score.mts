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

import type { ListItem, Root, RootContent } from "mdast";

import { contentColumn } from "../../src/lib/definition-column.js";
import { columnsOf } from "../../src/lib/item-dot-threshold.js";
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

/** Every container that nests, and the quote-only half of it. */
const NESTING_ANY = new Set(["blockquote", "callout", "listItem"]);
const NESTING_QUOTE = new Set(["blockquote", "callout"]);

/**
 * The nesting depth of the container holding each definition, keyed by its zero-based line.
 *
 * Shared by the two nested-column scopings below, which differ ONLY in which container types
 * count as nesting -- and that difference is the whole measurement, so it has to be the only
 * thing that varies between them.
 */
function depthsByLine(
  tree: Root,
  kinds: ReadonlySet<string>,
): Map<number, number> {
  const depths = new Map<number, number>();
  const walk = (node: unknown, depth: number): void => {
    const self = node as {
      type: string;
      position?: { start: { line: number } };
      children?: unknown[];
    };
    if (self.type === "footnoteDefinition" || self.type === "definition") {
      const line = (self.position?.start.line ?? 0) - 1;
      // The OUTERMOST reading wins: `walk` descends, a definition is visited once, so
      // whatever depth it is reached at is the nesting of the container holding it.
      if (!depths.has(line)) depths.set(line, depth);
    }
    const nested = kinds.has(self.type) ? depth + 1 : depth;
    for (const child of self.children ?? []) walk(child, nested);
  };
  walk(tree, 0);
  return depths;
}

/**
 * A column-0 definition's column from its container nesting, at 2 per level above one.
 *
 * The precondition is that the label begins at column 0 LITERALLY -- the bracket is the
 * line's first character. Testing `/^[ \t>]/` instead, "no whitespace or quote prefix", was
 * the first version and it fired on lines carrying a LIST prefix, which that does not match:
 * `2)  > [!NOTE]- [^注1]: ...` has its label at column 15 and the rule overwrote it with 2.
 * Scored `better 0 worse 22`, and all three printed examples were that mistake rather than
 * the rule failing -- the fifth time a new oracle's first finding has been a bug in the
 * oracle.
 */
function nestedColumn(
  text: string,
  ours: Facts,
  tree: Root,
  kinds: ReadonlySet<string>,
): Facts {
  const lines = text.split("\n");
  const depthOf = depthsByLine(tree, kinds);
  return {
    refs: ours.refs,
    defs: ours.defs.map((d): Def => {
      if (!(lines[d[1]] ?? "").startsWith("[")) return d;
      const depth = depthOf.get(d[1]) ?? 0;
      if (depth < 2) return d;
      const want = 2 * (depth - 1);
      return want === d[2] ? d : [d[0], d[1], want, d[3]];
    }),
  };
}

/**
 * References on a paragraph that an html sibling would have swallowed, dropped.
 *
 * Shared by the two html-extent candidates so the only thing that varies between them is the
 * set of hosts, which is the whole measurement.
 */
function dropRefsAfterHtml(
  text: string,
  ours: Facts,
  tree: Root,
  hosts: ReadonlySet<string>,
): Facts {
  const dead = new Set<number>();
  const walk = (node: unknown): void => {
    const self = node as { type?: string; children?: RootContent[] };
    if (self.type !== undefined && hosts.has(self.type) && self.children) {
      for (let index = 0; index < self.children.length - 1; index++) {
        const html = self.children[index];
        const next = self.children[index + 1];
        if (html?.type !== "html" || next?.type !== "paragraph") continue;
        const from = next.position?.start.line;
        const to = next.position?.end.line;
        if (from === undefined || to === undefined) continue;
        for (let line = from - 1; line <= to - 1; line++) dead.add(line);
      }
    }
    for (const child of self.children ?? []) walk(child);
  };
  walk(tree);
  return { defs: ours.defs, refs: ours.refs.filter((r) => !dead.has(r[1])) };
}

/**
 * A definition's end pulled back before the first line of a given shape, at column 0.
 *
 * COLUMN 0 ONLY, which is what keeps it out of the indentation argument: an indented heading
 * or label is the definition's own content, and E1's enders are stated for a line that starts
 * a block of its own. Shared by the two candidates so the only thing varying is the shape.
 */
function endBefore(text: string, ours: Facts, shape: RegExp): Facts {
  const lines = text.split("\n");
  return {
    refs: ours.refs,
    defs: ours.defs.map((d): Def => {
      for (let line = d[1] + 1; line <= d[3]; line++) {
        const at = lines[line] ?? "";
        if (/^[ \t]/u.test(at)) continue;
        if (shape.test(at)) return [d[0], d[1], d[2], line - 1];
      }
      return d;
    }),
  };
}

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
    name: "container-comment-swallows",
    what: "a column-0 unclosed `%%` after a container swallows to the end of the note",
    apply: (text, ours, tree) => {
      // The container's own end line, from the TREE rather than a scan: "directly after a
      // container" is exactly the state a backward line scan cannot see, and it is what four
      // scopings of the tab candidate each approximated and each got wrong.
      const lines = text.split("\n");
      const ends: number[] = [];
      for (const node of tree.children) {
        if (node.type !== "list" && node.type !== "blockquote") continue;
        const end = node.position?.end?.line;
        if (end !== undefined) ends.push(end); // 1-based end == 0-based next line
      }

      let cut = Number.POSITIVE_INFINITY;
      for (const next of ends) {
        if (!/^%%/u.test(lines[next] ?? "")) continue;
        // Unclosed from here to the end of the note. An opener alone on its line is the
        // whole marker, so a closer means a SECOND `%%` somewhere below it.
        const rest = lines.slice(next).join("\n").slice(2);
        if (rest.includes("%%")) continue;
        cut = Math.min(cut, next);
      }
      if (cut === Number.POSITIVE_INFINITY) return ours;

      return {
        defs: ours.defs.filter((d) => d[1] < cut),
        refs: ours.refs.filter((r) => r[1] < cut),
      };
    },
  },
  {
    name: "container-comment-swallows-defs",
    what: "...and only the DEFINITIONS below it, leaving references indexed",
    apply: (text, ours, tree) => {
      const lines = text.split("\n");
      const ends: number[] = [];
      for (const node of tree.children) {
        if (node.type !== "list" && node.type !== "blockquote") continue;
        const end = node.position?.end?.line;
        if (end !== undefined) ends.push(end);
      }
      let cut = Number.POSITIVE_INFINITY;
      for (const next of ends) {
        if (!/^%%/u.test(lines[next] ?? "")) continue;
        const rest = lines.slice(next).join("\n").slice(2);
        if (rest.includes("%%")) continue;
        cut = Math.min(cut, next);
      }
      if (cut === Number.POSITIVE_INFINITY) return ours;
      return { defs: ours.defs.filter((d) => d[1] < cut), refs: ours.refs };
    },
  },
  {
    name: "quote-tab-no-define",
    what: "a tab DIRECTLY after a quote marker means the label does not define -- SCORED, NOT SHIPPED",
    apply: (text, ours) => {
      // Unmasked by `mathListExtentTransform`: a swallowing formula had been hiding it.
      // Measured on 1.14.4, and the space form is the control that makes it a rule about the
      // TAB rather than about quoted definitions:
      //
      //     >\t[^Ω]: body text   defs=[]            tab directly after `>`: nothing
      //     >   [^Ω]: body text  defs=[["ω",0]]     three spaces: defines
      //
      // Scoped to a tab IMMEDIATELY after the marker. `>   ⇥[^1]: def` is a definition at
      // column 2 -- recorded in `definition-column.ts` -- so a tab AFTER a space is a
      // different shape and must keep defining.
      //
      // NOT IMPLEMENTED, and the reason is the standing rule that a tree-derived premise is
      // still OUR tree, so probes against the application outrank a rule fitted to referee
      // rows. Asked directly, our SIMPLE cases are already right -- `>\t[^b]:` defines
      // nothing here and does define in bare `remark-parse` + `remark-gfm`, `>   [^b]:`
      // defines, and the three-line established form defines both. So the +29 is a
      // CONTEXTUAL defect, not this rule: `reproducers.json#881` is the shape to chase,
      // where `>\t[^名]: def` over `  \t[^2]: body text` should define only `2` and we
      // define only `名`. Shipping a line-based drop would fit the referee while
      // contradicting five controls.
      const lines = text.split("\n");
      const tabbed = /^[ \t]*>\t/u;
      return {
        refs: ours.refs,
        defs: ours.defs.filter((d) => !tabbed.test(lines[d[1]] ?? "")),
      };
    },
  },
  {
    name: "quote-tab-no-define-unless-established",
    what: "...unless an earlier definition in the same quote already succeeded",
    apply: (text, ours) => {
      // The blunt rule scores 52/1, and the single counter-example needs a THREE-element
      // shape, pinned with four controls:
      //
      //     >\t[^b]:                        nothing
      //     > text / > / >\t[^b]:           nothing -- a blank quote line alone is not it
      //     > [^a]: It / > / >\t[^b]:       BOTH -- a preceding definition that SUCCEEDED
      //     >\t[^b]: / > / >\t[^c]:         nothing -- the first never defined, nor does the
      //                                     second, so the exception does not chain off a
      //                                     failed one
      //
      // So a tab-indented label defines once the quote already holds a definition, which is
      // consistent with the first one establishing the quote's content column.
      const lines = text.split("\n");
      const tabbed = /^[ \t]*>\t/u;
      const defines = /^[ \t]*>[ \t]+\[\^[^\]]*\]:/u;
      return {
        refs: ours.refs,
        defs: ours.defs.filter((d) => {
          if (!tabbed.test(lines[d[1]] ?? "")) return true;
          // An earlier SPACE-separated definition line in the same quote run establishes it.
          for (let line = d[1] - 1; line >= 0; line--) {
            const text2 = lines[line] ?? "";
            if (!/^[ \t]*>/u.test(text2)) break;
            if (defines.test(text2)) return true;
          }
          return false;
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
    name: "lazy-chain-through-break",
    what: "a list's chain to a definition survives an intervening thematic break",
    apply: (text, ours, tree) => {
      // `code` was the link that broke the chain and accepting it gained 43 documents. The
      // other node types that can sit between a list and a definition are `thematicBreak`
      // and a link-reference `definition`; `html`, `heading`, `paragraph`, `table` and
      // `math` are already accepted after a list. This asks whether the chain should survive
      // those two as well.
      const through = new Set([
        "code",
        "html",
        "heading",
        "paragraph",
        "table",
        "math",
        "thematicBreak",
        "definition",
      ]);
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
          if (prev.type === "list") {
            swallowed.add(start.line - 1);
            break;
          }
          if (!through.has(prev.type)) break;
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
  {
    name: "def-end-before-label",
    what: "a definition ends before a column-0 label line, which E1 says ends it",
    // `shapes.mts` put `def-end+1` at 80 documents; classifying the SURPLUS line -- the one we
    // absorb and Obsidian does not -- over all 113 entries gives:
    //
    //     39  text          lazy continuation, correct to absorb per E1
    //     38  definition    E1: "another label" ENDS a definition
    //     30  bullet        E1: "list items" end it
    //     10  heading       E1: "ATX headings" end it
    //      7  comment       D5: `%%` is lazy text, correct to absorb
    //      7  fence         E1: fences end it
    //
    // So 85 of 113 are enders E1 names and we take them in anyway. This candidate is the
    // cleanest of them, a label at column 0, where E1 is unambiguous and no indentation
    // argument applies.
    //
    // SCORED, NOT SHIPPED: better 5, worse 1, and the worse document was ALREADY disagreeing
    // -- no agreeing document breaks, checked by identity rather than read off the total.
    //
    // It is not implementable as an end position, which is why it stayed here. In
    // `probes.json#388`, `[^9]: orphan` / `⟨4sp⟩<!--` / `[^1]: one` / `-->`, our first
    // definition ends on the label's own line and the indented `<!--` CHILD extends into that
    // line too. Pulling the parent's end back therefore orphans the child, which the invariant
    // gate reports; doing it properly means shrinking the html as well, and `fuzz#2814` needs
    // a list split for the same reason. A guard that declines whenever a child would be
    // orphaned makes the pass completely INERT, measured at 0 gained and 0 lost, so the
    // position-only version was reverted rather than left in place looking like a fix.
    //
    // Five documents against child surgery on a definition's content is the wrong trade, and
    // it is recorded here rather than attempted.
    apply: (text, ours) => endBefore(text, ours, /^\[\^[^\]]*\]:/u),
  },
  {
    name: "def-end-before-any-ender",
    what: "...and before a column-0 heading, fence or list marker too",
    // The same rule over the rest of E1's list. Each is stated there for a definition's text
    // and each appears in the table above, so the question is only whether taking all four at
    // once costs anything the label alone does not.
    apply: (text, ours) =>
      endBefore(
        text,
        ours,
        /^(?:\[\^[^\]]*\]:|#{1,6}(?:[ \t]|$)|```|~~~|(?:[-*+])(?:[ \t]|$)|1[.)](?:[ \t]|$))/u,
      ),
  },
  {
    name: "b3-item-minimum-indent",
    what: "an item's content column is the SMALLEST indentation among its own indented lines",
    // Their B3, and the one open item that is a new rule rather than an extension. `- a` /
    // `⟨1sp⟩lazy` / `⟨4sp⟩[^1]:` reports column 1 in Obsidian and 2 here, because the item's
    // content column is the minimum over its lines and we use the marker's width.
    //
    // Column-0 lines are EXCLUDED, which is the other half of B3 -- "Obsidian leaves
    // unindented lines out of the minimum" -- and the half that made the original probe set
    // unable to see the rule at all: all five of its notes had a column-0 continuation.
    //
    // SCORED TWICE, NOT SHIPPED, and the pair is the result:
    //
    //     line ranges, minimum across overlapping items   better 0  worse 521
    //     tree containment, innermost item wins           better 0  worse 117
    //
    // The second fixed two real defects in the predicate -- a definition our tree places
    // inside an item but past a blank line was never reached, and `definition-column.ts`
    // records that the INNERMOST item owns the column -- and the gain stayed at ZERO.
    //
    // ZERO BETTER OVER 1,833 SHAPED DOCUMENTS is the finding. The referee corpus holds the
    // shape in abundance and not one of its answers is reached by this rule, while three
    // probes against live 1.14.4 show the rule plainly:
    //
    //     - a / ⟨1sp⟩lazy / ⟨4sp⟩[^1]:        obs column 1, ours 2
    //     -⟨3sp⟩a / ⟨1sp⟩lazy / ⟨4sp⟩[^1]:    obs column 1, ours 4
    //
    // So the rule is REAL and this corpus cannot adjudicate it: its shaped documents are
    // items inside quotes and callouts, where indentation is measured from the container's
    // content column rather than from column zero, and a root item with a sub-content
    // continuation AND a column that differs is not among them.
    //
    // THE 2.05x LIFT WAS A CORRELATE. 895 documents hold the shape and 354 disagree against a
    // 19.3% base rate, which read as the largest actionable family on this oracle. A rule that
    // gains zero over all of them says the shape marks a document as HARD rather than naming
    // its cause -- the tab family's signature exactly, at 2.06x and a ceiling of ten. Fifth
    // selector to die this way, and the first to die after being measured as a lift rather
    // than as a raw count.
    apply: (text, ours, tree) => {
      const lines = text.split("\n");
      const MARKER = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/u;

      /** The innermost host item of each definition, by tree containment. */
      const floorOf = new Map<number, number>();
      const hosts: Array<{ item: any; floor: number }> = [];
      const walk = (node: unknown): void => {
        const self = node as {
          type?: string;
          position?: { start: { line: number }; end: { line: number } };
          children?: unknown[];
        };
        if (self.type === "listItem" && self.position) {
          const first = self.position.start.line - 1;
          const marker = MARKER.exec(lines[first] ?? "");
          if (marker) {
            let least = marker[0].length;
            for (let at = first + 1; at <= self.position.end.line - 1; at++) {
              const line = lines[at] ?? "";
              if (line.trim() === "") continue;
              const indent = columnsOf(line);
              if (indent > 0 && indent < least) least = indent;
            }
            hosts.push({ item: self, floor: least });
          }
        }
        for (const child of self.children ?? []) walk(child);
      };
      walk(tree);

      // Pre-order, so an outer item is pushed before an inner one and overwriting keeps the
      // INNERMOST -- the same reason `definition-column.ts` overwrites rather than keeps.
      for (const { item, floor } of hosts) {
        const mark = (node: unknown): void => {
          const self = node as {
            type?: string;
            position?: { start: { line: number } };
            children?: unknown[];
          };
          if (
            (self.type === "footnoteDefinition" ||
              self.type === "definition") &&
            self.position
          ) {
            floorOf.set(self.position.start.line - 1, floor);
          }
          for (const child of self.children ?? []) mark(child);
        };
        mark(item);
      }

      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          const floor = floorOf.get(d[1]);
          if (floor === undefined || floor >= d[2]) return d;
          return [d[0], d[1], floor, d[3]];
        }),
      };
    },
  },
  {
    name: "b3-minimum-container-relative",
    what: "...the same minimum, measured AFTER the container's own prefix",
    // The third premise, and the one that tests whether B3 is implementable at all rather
    // than whether it is real. Both earlier attempts measured indentation from COLUMN ZERO,
    // and the corpus's shaped documents are items inside quotes and callouts, where every
    // line carries a `>` run that is the container's and not the item's. So the minimum was
    // being taken over the wrong quantity, which is enough on its own to explain 0 better.
    //
    // SCORED, NOT SHIPPED: better 0, worse 119. So THREE premises now -- column-zero by line
    // range, column-zero by containment, and container-relative -- score 0 better at 521, 117
    // and 119 worse. The gain does not depend on how the minimum is measured, and the losing
    // documents are the same ones each time.
    //
    // What they have in common is instructive: Obsidian keeps the MARKER's column where an
    // indented line below it exists, so the minimum is not applied there at all. In the probe
    // cases it is. Something narrower than "an indented line exists" selects between them, and
    // this corpus cannot say what, because it never reaches the probe shape.
    apply: (text, ours, tree) => {
      const lines = text.split("\n");
      const PREFIX = /^(?:[ \t]*>[ \t]?)*/u;
      const MARKER = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/u;

      const floorOf = new Map<number, number>();
      const hosts: Array<{ item: unknown; floor: number }> = [];
      const walk = (node: unknown): void => {
        const self = node as {
          type?: string;
          position?: { start: { line: number }; end: { line: number } };
          children?: unknown[];
        };
        if (self.type === "listItem" && self.position) {
          const first = self.position.start.line - 1;
          const head = lines[first] ?? "";
          // The container's own prefix, measured on the item's FIRST line and reused for the
          // rest: it is the quote's width, not the item's, so it is outside the minimum.
          const prefix = PREFIX.exec(head)?.[0].length ?? 0;
          const marker = MARKER.exec(head.slice(prefix));
          if (marker) {
            let least = marker[0].length;
            for (let at = first + 1; at <= self.position.end.line - 1; at++) {
              const line = lines[at] ?? "";
              if (line.trim() === "") continue;
              const inner = line.slice(PREFIX.exec(line)?.[0].length ?? 0);
              const indent = columnsOf(inner);
              if (indent > 0 && indent < least) least = indent;
            }
            hosts.push({ item: self, floor: prefix + least });
          }
        }
        for (const child of self.children ?? []) walk(child);
      };
      walk(tree);

      for (const { item, floor } of hosts) {
        const mark = (node: unknown): void => {
          const self = node as {
            type?: string;
            position?: { start: { line: number } };
            children?: unknown[];
          };
          if (
            (self.type === "footnoteDefinition" ||
              self.type === "definition") &&
            self.position
          ) {
            floorOf.set(self.position.start.line - 1, floor);
          }
          for (const child of self.children ?? []) mark(child);
        };
        mark(item);
      }

      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          const floor = floorOf.get(d[1]);
          if (floor === undefined || floor >= d[2]) return d;
          return [d[0], d[1], floor, d[3]];
        }),
      };
    },
  },
  {
    name: "b3-minimum-first-chunk",
    what: "...the minimum over the item's OWN lines, stopping at its first blank",
    // The fourth premise, and the first with a probe family behind it rather than a reading
    // of their prose. Eight cases against live 1.14.4 fix the rule precisely:
    //
    //     - a / lazy(col 0) / blank / ⟨4sp⟩[^1]:    col 2   (column-0 line excluded)
    //     - a / ⟨1sp⟩lazy   / blank / ⟨4sp⟩[^1]:    col 1
    //     - a / ⟨2sp⟩b      / blank / ⟨4sp⟩[^1]:    col 2
    //     -⟨3sp⟩a / ⟨1sp⟩lazy / blank / ⟨4sp⟩[^1]:  col 1   (marker width 4, still 1)
    //     - a / lazy(col 0) / blank / ⟨8sp⟩[^1]:    NONE    (8 - 2 >= 4, indented code)
    //     - a / blank / ⟨4sp⟩[^1]:                  col 2   (no continuation at all)
    //     > - a / >⟨2sp⟩lazy / > / >⟨5sp⟩[^1]:      col 3   (container-relative, then absolute)
    //     1. a / ⟨1sp⟩lazy  / blank / ⟨4sp⟩[^1]:    col 1
    //
    // All eight are `min(marker content column, indentation of continuation lines)` with
    // column-zero lines left out -- which is what premise 3 computed. The difference is the
    // SCAN RANGE. Premise 3 took every line in the item's line range, so lines belonging to
    // nested blocks past a blank line entered the minimum, and that is what cost it 119
    // documents: in the callout cases the answer keeps the marker's column because the
    // indent-2 line it was being lowered to is a NESTED block's line, not the item's.
    //
    // B3's wording is "the smallest indentation among ITS OWN LINES", and the item's own lines
    // are the first chunk -- the consecutive non-blank lines from the marker to the first
    // blank, which is exactly what stock de-indents before deciding what follows is code.
    apply: (text, ours, tree) => {
      const lines = text.split("\n");
      const PREFIX = /^(?:[ \t]*>[ \t]?)*/u;
      // THE CHECKBOX IS PART OF THE MARKER. `- [ ] ` is six columns, not two, and a definition
      // on a task item's own line sits at exactly that column. Leaving it out is what cost
      // premises 1-4 their losses: they lowered correct answers of 6 down to 2.
      const MARKER = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/u;

      const floorOf = new Map<number, number>();
      const walk = (node: unknown): void => {
        const self = node as {
          type?: string;
          position?: { start: { line: number }; end: { line: number } };
          children?: unknown[];
        };
        if (self.type === "listItem" && self.position) {
          const first = self.position.start.line - 1;
          const head = lines[first] ?? "";
          const prefix = PREFIX.exec(head)?.[0].length ?? 0;
          const marker = MARKER.exec(head.slice(prefix));
          if (marker) {
            let least = marker[0].length;
            // THE ITEM'S OWN LINES: stop at the first blank. Everything past it is a separate
            // block, and premise 3's losses were all lines reached past this point.
            for (let at = first + 1; at <= self.position.end.line - 1; at++) {
              const line = lines[at] ?? "";
              const inner = line.slice(PREFIX.exec(line)?.[0].length ?? 0);
              if (inner.trim() === "") break;
              const indent = columnsOf(inner);
              if (indent > 0 && indent < least) least = indent;
            }
            const floor = prefix + least;
            const mark = (node: unknown): void => {
              const inner = node as {
                type?: string;
                position?: { start: { line: number } };
                children?: unknown[];
              };
              if (
                (inner.type === "footnoteDefinition" ||
                  inner.type === "definition") &&
                inner.position
              ) {
                floorOf.set(inner.position.start.line - 1, floor);
              }
              for (const child of inner.children ?? []) mark(child);
            };
            mark(self);
          }
        }
        for (const child of self.children ?? []) walk(child);
      };
      walk(tree);

      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          const floor = floorOf.get(d[1]);
          if (floor === undefined || floor >= d[2]) return d;
          return [d[0], d[1], floor, d[3]];
        }),
      };
    },
  },
  {
    name: "b3-threshold-drops-definition",
    what: "...and the SAME floor moves where indented code begins",
    // The other half of B3, and the referee CAN adjudicate this one -- which is the correction
    // to "this oracle cannot see B3". Measured: the shipped column fix changes the answer for
    // exactly FOUR of 6,818 documents, and all four are the sibling project's own designed B3
    // probes with Obsidian's answer recorded:
    //
    //     -⟨3sp⟩a / ⟨2sp⟩b / ⟨6sp⟩[^1]: x    defs []   probe:k-dash3-2-6
    //     -⟨3sp⟩a / ⟨1sp⟩b / ⟨5sp⟩[^1]: x    defs []   probe:k-dash3-1-5
    //     1. a    / ⟨1sp⟩b / ⟨6sp⟩[^1]: x    defs []   probe:k-ord-1-6
    //     - a     / ⟨1sp⟩b / ⟨5sp⟩[^1]: x    defs []   probe:k-dash-1-5
    //
    // NO DEFINITION AT ALL, because the lowered column moves the code threshold with it. The
    // two readings agree on every case once both halves are applied:
    //
    //     - a / ⟨1sp⟩lazy / ⟨4sp⟩[^1]:    floor 1, 4 - 1 = 3 < 4   definition at column 1
    //     - a / ⟨1sp⟩b    / ⟨5sp⟩[^1]:    floor 1, 5 - 1 = 4 >= 4  CODE, no definition
    //
    // So the shipped half is correct and incomplete, which is the shape this harness refuses
    // when it can see it -- and here it could, through four documents nobody had looked at.
    //
    // SCORED TWICE, NOT SHIPPED, and the pair is the point:
    //
    //     floor re-derived here           better 28  worse 48  agreement -37
    //     floor from `contentColumn`       better 20  worse 17  agreement -12
    //
    // The first re-derived the base from `marker[0].length` and so read `1.⟨5sp⟩` as seven
    // columns where the five-space cap makes it four -- the SIXTH premise about this quantity
    // to be refuted by its own arithmetic. That is why `contentColumn` is exported now and why
    // this candidate calls it: a divergence between the scorer and the pass is impossible by
    // construction rather than by review.
    //
    // The second still loses 17, and they are a UNIT MISMATCH in the shipped function rather
    // than a counter-example to the rule:
    //
    //     - a / ⟨4sp⟩- b / ⇥⇥- [^1]: def       answer column 4, we drop the definition
    //     * a / ⇥* b     / ⇥⇥* [^1]: def       answer column 4, we drop the definition
    //
    // `contentColumn` returns `opener[0].length`, which is CHARACTERS, while the threshold
    // compares the definition's indent in COLUMNS with tabs expanded to their four-stop. For
    // `⇥⇥- ` that is 4 against 8, so the threshold fires on an item whose content begins
    // exactly where the definition does. Both halves of B3 need one unit, and picking it is a
    // change to the shipped column answer rather than to this candidate -- so it is left here
    // with its number instead of being bought at -12.
    //
    // Note the shape: positive on DISTANCE and negative on AGREEMENT, which this harness has
    // seen once before, on F5. Both times it meant the rule was right and its boundary wrong.
    apply: (text, ours, tree) => {
      const lines = text.split("\n");
      const PREFIX = /^(?:[ \t]*>[ \t]?)*/u;

      // The host map is the transform's own: pre-order, so the INNERMOST item overwrites.
      const items = new Map<unknown, ListItem>();
      const index = (node: unknown): void => {
        const self = node as { type?: string; children?: unknown[] };
        if (self.type === "listItem") {
          const mark = (inner: unknown): void => {
            items.set(inner, self as unknown as ListItem);
            for (const child of (inner as { children?: unknown[] }).children ??
              []) {
              mark(child);
            }
          };
          mark(self);
        }
        for (const child of self.children ?? []) index(child);
      };
      index(tree);

      const drop = new Set<number>();
      const scan = (node: unknown): void => {
        const self = node as {
          type?: string;
          position?: { start: { line: number } };
          children?: unknown[];
        };
        if (
          (self.type === "footnoteDefinition" || self.type === "definition") &&
          self.position
        ) {
          const host = items.get(self);
          // `contentColumn` ALREADY carries B3's minimum, the five-space cap, the dot
          // adjustment and the tab stops -- which is the entire reason it is called rather
          // than re-derived here.
          const column = host ? contentColumn(text, host) : undefined;
          if (column !== undefined) {
            const at = self.position.start.line - 1;
            const raw = lines[at] ?? "";
            const own = PREFIX.exec(raw)?.[0].length ?? 0;
            const body = raw.slice(own);
            // CHARACTERS, not expanded columns -- a tab counts as ONE, which is the unit
            // `contentColumn` reports in and the unit Obsidian answers in. Measured:
            // `- a` / `⟨4sp⟩- b` / `⇥⇥- [^1]: def` is column 4, so `⇥⇥- ` is four and not ten.
            // The earlier version expanded tabs here and compared 8 against a content column of
            // 4, which is what cost it 17 documents.
            // A TAB AFTER A SPACE does not reach the code threshold, which
            // `definition-column.ts` records from the arbiter and six probes confirm: a
            // LEADING tab counts its four columns, one after a space counts nothing. So
            // `- p` / `⟨5sp⟩⇥[^1]: def` is five for this purpose and keeps its definition at
            // column 2, where counting the tab made it six and dropped it.
            // CHARACTERS, a tab counting ONE, and a tab that follows a space ending the
            // count. Both halves are measured:
            //
            //   `- a` / `⟨4sp⟩- b` / `⇥⇥- [^1]: def`   column 4, so `⇥⇥` is TWO, not eight --
            //                                          expanding leading tabs here cost 3
            //   `- p` / `⟨5sp⟩⇥[^1]: def`              column 2, so the tab after five spaces
            //                                          adds NOTHING, which is the arbiter rule
            //                                          `definition-column.ts` already carries
            const run = body.slice(0, body.length - body.trimStart().length);
            let indent = 0;
            let sawSpace = false;
            for (const character of run) {
              if (character === "\t" && sawSpace) break;
              if (character === " ") sawSpace = true;
              indent += 1;
            }
            if (indent + own >= column + 4) drop.add(at);
          }
        }
        for (const child of self.children ?? []) scan(child);
      };
      scan(tree);

      return {
        refs: ours.refs,
        defs: ours.defs.filter((d) => !drop.has(d[1])),
      };
    },
  },
  {
    name: "def-end-tab-continuation",
    what: "a definition absorbs a following line whose indent holds a TAB",
    // `def-end+1` is the largest positional family left at 80 documents, and five of its ten
    // shortest have the same shape: the line past our end carries a TAB in its indentation and
    // Obsidian takes it into the definition.
    //
    //     ⟨2sp⟩10.⇥[^b]: def / ⇥# heading          obs end 1, ours 0
    //     >>[^ä]: def        / ⇥More               obs end 1, ours 0
    //     ⟨3sp⟩1.⟨4sp⟩[^Note]: Definition / ⟨5sp⟩⇥- item   obs end 1, ours 0
    //     -⟨4sp⟩[^ä]: Definition / ⟨2sp⟩⇥# heading obs end 1, ours 0
    //
    // What they have in common is that the absorbed line would be a BLOCK of its own at that
    // indentation -- a heading, a list item, a `$$` -- so this is not about what the line is.
    // It is about the tab making the line a continuation of the definition.
    //
    // REFUTED, both scopes:
    //
    //     any definition         better 17  worse 44  agreement -19
    //     single-line only       better 12  worse 39  agreement -19
    //
    // Narrowing cut both sides and moved agreement not at all, which is the signature of a
    // predicate selecting the wrong population rather than one that is merely too wide. The
    // losses are definitions inside quotes and callouts where the tabbed line belongs to the
    // CONTAINER, and nothing in a `[name, line, col, endLine]` tuple can tell those apart --
    // the same structural limit this harness records for the containing-block family.
    //
    // Consistent with the earlier pass-level refusal of `def-end+1`, which measured label-only
    // enders at 5/1 and all four enders at 6/4 and concluded the clean rule is not expressible
    // as an end position. Two independent instruments now say so.
    apply: (text, ours) => {
      const lines = text.split("\n");
      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          const next = lines[d[3] + 1];
          if (next === undefined || next.trim() === "") return d;
          const run = next.slice(0, next.length - next.trimStart().length);
          if (!run.includes("\t")) return d;
          // SINGLE-LINE definitions only. Unrestricted this scored 17/44, and the losses were
          // definitions already spanning lines that the rule then extended further -- the
          // absorption is about a definition that ended on its own label line.
          if (d[3] !== d[1]) return d;
          return [d[0], d[1], d[2], d[3] + 1];
        }),
      };
    },
  },
  {
    name: "def-in-definition-host",
    what: "a definition nested in a footnoteDefinition takes min(indent, 4)",
    // `definition-column.ts` builds its host map from `listItem` ONLY, so a definition absorbed
    // into another footnote definition finds no host and is clamped to column 0. Obsidian gives
    // it the bracket:
    //
    //     [^ä]: def / blank / ⟨2sp⟩⇥[^ch2*]: body text     obs column 3, ours 0
    //
    // Both sides agree the outer definition spans all three lines, so the inner one really is
    // its child. A footnote definition's own content column is 4 -- the standard continuation
    // indent -- so `min(indent, hostContentColumn)` is `min(3, 4)` and the existing formula
    // gives Obsidian's answer with no new arithmetic, only a second host type.
    //
    // That is the shape this harness records as the one that lands: an already-measured rule
    // extended to a node type it was never scoped for.
    apply: (text, ours, tree) => {
      const lines = text.split("\n");
      // Line -> the nested definition's own bracket column, from the TREE rather than from a
      // scan: `[^1]: [^2]: x` holds two on one line and `indexOf("[^")` cannot tell them apart.
      const hosted = new Map<number, number>();
      const walk = (node: unknown, inside: boolean): void => {
        const self = node as {
          type?: string;
          position?: { start: { line: number; column: number } };
          children?: unknown[];
        };
        if (
          inside &&
          (self.type === "footnoteDefinition" || self.type === "definition") &&
          self.position
        ) {
          hosted.set(
            self.position.start.line - 1,
            self.position.start.column - 1,
          );
        }
        const next = inside || self.type === "footnoteDefinition";
        for (const child of self.children ?? []) walk(child, next);
      };
      walk(tree, false);

      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          if (!hosted.has(d[1])) return d;
          // ONLY where the definition starts its own line. `[^1]: [^2]: x` puts the inner one
          // behind the outer's label and Obsidian reports its bracket at 6 with no clamp --
          // the same precondition `definition-column.ts` enforces by requiring the line's
          // prefix to be whitespace, a quote run or a list marker. Unrestricted this scored
          // 5/4 and all four losses were that shape.
          //
          // Keyed on how many definitions share the line rather than on the node's own column,
          // because by the time the scorer sees the tree `definitionColumnTransform` has
          // already moved that column to 0 -- reading it back finds the clamp, not the bracket,
          // and the candidate measured NOTHING on 6,818 documents as a result.
          if (ours.defs.filter((other) => other[1] === d[1]).length !== 1) {
            return d;
          }
          const line = lines[d[1]] ?? "";
          // NO QUOTE between the host and the definition. `[^9]: x` / `⟨4sp⟩> [!tip]` /
          // `⟨4sp⟩> [^1]: def` is column 6 -- the innermost container is the BLOCKQUOTE, whose
          // content column is the indent plus its own marker, not the definition's 4. Modelling
          // that is a second host type; excluding it costs the one document this rule had wrong
          // and leaves 5 better against 0.
          if (/^[ \t]*>/u.test(line)) return d;
          const run = line.length - line.trimStart().length;
          return [d[0], d[1], Math.min(run, 4), d[3]];
        }),
      };
    },
  },
  {
    name: "def-name-ascii-whitespace",
    what: "a definition whose NAME holds ASCII whitespace defines nothing",
    // `footnote-bare.ts` already enforces this for REFERENCES -- their E5b, "a name may not
    // hold ASCII whitespace, so `a[^x [y]` is no reference at all" -- and nothing enforces it
    // for DEFINITIONS. GFM accepts a space in a footnote label, so we build the node:
    //
    //     [^a b]: x     obs defines NOTHING, we define `a b`
    //
    // ASCII ONLY, which this harness already records as the trap in the reference half: the
    // referee's own answers hold six names that are `a\u00a0b` and `a\u3000b`, a no-break and
    // an ideographic space, so a `\s` class would reject names Obsidian accepts.
    //
    // SCORED better 2 / worse 0, agreement UNCHANGED, and NOT implemented. The rule is right --
    // seven probes against live 1.14.4 settle it, and the non-ASCII half with them:
    //
    //     [^a b]: x        defs []         [^a\u00a0b]: x   defs ["a b"]
    //     [^a⇥b]: x        defs []         [^a\u3000b]: x   defs ["a　b"]
    //     [^a  b]: x       defs []         [^ab]: x         defs ["ab"]
    //     > [^a b]: x      defs []
    //
    // What stops it is size against risk. The shape occurs in THREE of 6,818 referee documents
    // and the candidate reaches two of them for no agreement gain; all three corpus cases
    // (`probe/label-shape/space-only-defined` and `hunt/invalid-name-rewritten-by-rules/0-1`)
    // already MATCH. So the package is right everywhere a committed gate can see, and this is
    // the referee's raw tree walk reporting a node the PROJECTION already drops -- the same
    // class as the 247 buried definitions that turned out to be a bug in the measurement.
    //
    // And the discriminator is not understood, which is the real blocker: `[^a b]: x` builds a
    // definition here while `[^my note]: x`, `[^1 ]: x` and `[^ ]: x` do not, all with one
    // ASCII space. Something narrower than "holds a space" decides it -- probably
    // `legacy-definition.ts`, which re-decides definitions under `remark-parse@8`'s label rules
    // -- and dropping nodes by name before knowing why would be fitting, not fixing.
    //
    // Converting the node to text is also the refused `shortCommentTransform` shape: a
    // definition rendered as literal text makes the serialiser escape its `[`, which is how one
    // parity case bought a formatter that grows the author's file.
    apply: (text, ours) => ({
      refs: ours.refs,
      defs: ours.defs.filter((d) => !/[ \t\n\r\f\v]/u.test(d[0])),
    }),
  },
  {
    name: "def-wide-separator-item-content",
    what: "a wide marker separator caps the item's content column, so a 4-indent label defines",
    // The largest non-tab bucket of `def-miss`: 67 entries where a list marker has a separator
    // of FIVE OR MORE and the definition below it sits at indent 4. We make that root-level
    // indented code and report no definition; Obsidian puts it inside the item.
    //
    // Seven probes against live 1.14.4, and the separator width is the whole discriminator:
    //
    //     1.⟨5sp⟩Prose here / ⟨4sp⟩[^1]: Definition     1@1:4
    //     ⟨2sp⟩1.⟨5sp⟩Prose / ⟨4sp⟩[^1]: Definition     1@1:4
    //     ⟨3sp⟩-⟨5sp⟩More   / ⟨4sp⟩[^1]: body text      1@1:4
    //     1.⟨5sp⟩p / blank  / ⟨4sp⟩[^1]: def            1@2:4
    //     1000. p  / blank  / ⟨5sp⟩[^1]: def            1@2:5
    //     1.⟨2sp⟩Prose here / ⟨4sp⟩[^1]: Definition     NONE
    //     -⟨2sp⟩p           / ⟨4sp⟩[^1]: def            NONE
    //
    // `definition-column.ts` already carries the cap for the COLUMN -- five or more spaces and
    // the content column falls back to the marker plus one -- and the tokenizer does not, so
    // micromark keeps the item's content at the separator's full width and a 4-indent line
    // falls outside it. The two narrow cases are correct as they are: there the paragraph's own
    // column IS 4, so the label is lazy continuation and defines nothing.
    //
    // THREE SCOPINGS, ALL NEGATIVE, and together they locate the work rather than refuse it:
    //
    //     line scan, previous line has a wide separator    better 11  worse  97
    //     ROOT indented code only                          better  0  worse   3
    //     any indented code + the B3 floor, fences out     better 31  worse 351
    //
    // The middle one is the diagnostic: restricted to root `code` the rule touches almost
    // nothing, because the shape arrives BOTH ways -- `⟨2sp⟩1.⟨5sp⟩Prose` / `⟨4sp⟩[^1]:` leaves
    // the label in a `code` INSIDE the item and `1000. p` / blank / `⟨5sp⟩[^1]:` leaves it in a
    // root one. Widening to both finds 31, and then invents 351 because a label our tree buried
    // was buried for a REASON -- a comment region, an unclosed fence, a swallowed container --
    // and nothing in a tree walk after the fact distinguishes "the item should have owned this
    // line" from "something else already claimed it".
    //
    // Which is the same conclusion from a third direction: B3's minimum governs the definition
    // column (shipped), the code threshold (shipped) and WHICH LINES CONTINUE THE ITEM, and
    // only the last one is the tokenizer's. `legacy-list.ts` is the vendored reader that would
    // carry it, and the incremental form is available -- a floor can only fall as lines arrive,
    // so admitting a line below `containerState.size` and lowering the size to its indent is
    // exactly the whole-item minimum computed in a stream.
    apply: (text, ours, tree) => {
      const lines = text.split("\n");
      const MARKER = /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+/u;
      const LABEL = /^([ \t]*)\[\^([^\]\s]+)\]:/u;
      const have = new Set(ours.defs.map((d) => `${d[0]}@${d[1]}`));
      const extra: Def[] = [];

      // Every label line our tree left inside a `code` node, at any depth. The earlier
      // root-only version touched almost nothing (0/3) because the shape arrives BOTH ways:
      // `⟨2sp⟩1.⟨5sp⟩Prose` / `⟨4sp⟩[^1]:` puts the label in a `code` INSIDE the item, while
      // `1000. p` / blank / `⟨5sp⟩[^1]:` puts it in a root one.
      const buried = new Set<number>();
      const collect = (node: unknown): void => {
        const self = node as {
          type?: string;
          lang?: string | null;
          position?: { start: { line: number }; end: { line: number } };
          children?: unknown[];
        };
        if (self.type === "code" && self.lang === null && self.position) {
          // INDENTED code only. A bare ``` arrives as `code` with a null `lang` exactly as
          // indented code does, so the node type cannot tell them apart and the source line
          // has to -- the trap `container-lazy.ts` records for the same reason. Without this
          // the candidate resurrected every label inside a fence and scored 31/358.
          const first = lines[self.position.start.line - 1] ?? "";
          if (
            !/^[ \t]*(?:```|~~~)/u.test(
              first.trimStart() === "" ? first : first,
            )
          ) {
            for (
              let at = self.position.start.line - 1;
              at <= self.position.end.line - 1;
              at++
            ) {
              buried.add(at);
            }
          }
        }
        for (const child of self.children ?? []) collect(child);
      };
      collect(tree);

      // B3's minimum, over the item's own lines up to and INCLUDING the label's. This is the
      // third thing that minimum governs -- after the definition's column and the code
      // threshold, which both shipped -- and it is the one the tokenizer decides: whether the
      // line continues the item at all.
      for (const at of [...buried].sort((a, b) => a - b)) {
        const label = LABEL.exec(lines[at] ?? "");
        if (!label) continue;
        let start = -1;
        for (let back = at - 1; back >= 0; back--) {
          const line = lines[back] ?? "";
          if (line.trim() === "") continue;
          if (MARKER.test(line)) {
            start = back;
            break;
          }
          if (!/^[ \t]/u.test(line)) break;
        }
        if (start === -1) continue;
        const marker = MARKER.exec(lines[start] ?? "")!;
        let floor = marker[0].length;
        for (let scan = start + 1; scan <= at; scan++) {
          const line = lines[scan] ?? "";
          if (line.trim() === "") continue;
          const indent = line.length - line.trimStart().length;
          if (indent > 0 && indent < floor) floor = indent;
        }
        const indent = label[1]!.length;
        if (indent < floor) continue;
        const name = label[2]!.toLowerCase();
        if (have.has(`${name}@${at}`)) continue;
        extra.push([name, at, Math.min(indent, floor), at]);
      }
      return { refs: ours.refs, defs: [...ours.defs, ...extra] };
    },
  },
  {
    name: "html-extent-item-block-tag",
    what: "a BLOCK TAG html in a list item swallows the following paragraph, as `<!--` already does",
    // `itemHtmlExtentTransform` carries this for the `<!--` opener only, and its own docstring
    // records why: over the referee corpus, `<!--` was unanimous at 58 of 58 while a bare
    // block tag was 27 of 29, so the block tag was left pending its own evidence. This is that
    // evidence, asked as a score rather than as a count.
    apply: (text, ours, tree) =>
      dropRefsAfterHtml(text, ours, tree, new Set(["listItem"])),
  },
  {
    name: "html-extent-any-container",
    what: "...and in a quote or callout too, not only a list item",
    // Their B4 states it for every container: "Fences, `$$` blocks, and HTML blocks inside
    // items and quotes run on through column-0 lines." The pass is scoped to `listItem`, and
    // these are the shortest `ref-extra` members in the queue:
    //
    //     2) <div> / Text[^2]        obs indexes nothing; we index a reference at 1:4
    //     > <div> / Text[^2]         the same in a quote
    //     > [!info] / ⇥Prose [^3]    the same in a callout
    //
    // At ROOT the html already swallows the line -- `<div>` over `Text[^2]` is one
    // `html@0-1` with no reference at all -- so this is the container case of a rule micromark
    // already applies, which is the shape that lands here.
    apply: (text, ours, tree) =>
      dropRefsAfterHtml(
        text,
        ours,
        tree,
        new Set(["listItem", "blockquote", "callout"]),
      ),
  },
  {
    name: "comment-burial-ends-at-blank",
    what: "a container-opened comment buries nothing past the first blank line",
    // The second premise for F4's open half, after the per-line prefix test scored 6 better
    // against 28 worse. That test was too strict because a container absorbs LAZY lines, so
    // "lacking the prefix" is not the same as "outside the container".
    //
    // A BLANK line is different: it ends a quote in CommonMark outright, no laziness about it.
    // So a comment opened inside a container buries only up to the first blank line after its
    // opener, which for `fuzz-20261003.json#1124` is lines 2-3 and matches Obsidian exactly.
    //
    // SCORED, NOT SHIPPED: better 7, worse 7, agreement 5452 -> 5449. An EVEN TRADE, which is
    // the verdict that says the corpus can see the rule and does not endorse it -- the shape
    // is right often enough to win seven documents and wrong often enough to lose seven.
    //
    // So BOTH premises for F4's open half are refuted, and the pair is the result: the family
    // is real at 207 documents and 2.17x lift, and neither "lacking the container's prefix"
    // nor "past the first blank line" expresses where Obsidian ends that comment. What is
    // needed is the container's TRUE extent, which our own tree cannot supply because the
    // too-wide extent IS the defect -- the circularity this harness records as "a predicate
    // that stands in for the premise is part of what you are measuring", fifth instance.
    apply: (text, ours, tree) => {
      const lines = text.split("\n");
      const quoted = (line: string) => /^[ \t]*>/u.test(line);

      const loose = new Set<number>();
      const walk = (node: unknown): void => {
        const self = node as {
          type?: string;
          position?: { start: { line: number }; end: { line: number } };
          children?: unknown[];
        };
        if (self.type === "comment" && self.position) {
          const opener = self.position.start.line - 1;
          if (quoted(lines[opener] ?? "")) {
            let blankAt = -1;
            for (
              let line = opener + 1;
              line <= self.position.end.line - 1;
              line++
            ) {
              if ((lines[line] ?? "").trim() === "") {
                blankAt = line;
                break;
              }
            }
            if (blankAt !== -1) {
              for (
                let line = blankAt;
                line <= self.position.end.line - 1;
                line++
              ) {
                loose.add(line);
              }
            }
          }
        }
        for (const child of self.children ?? []) walk(child);
      };
      walk(tree);

      return {
        defs: ours.defs,
        refs: ours.refs.filter((r) => !loose.has(r[1])),
      };
    },
  },
  {
    name: "comment-burial-needs-container-prefix",
    what: "a container-opened comment buries nothing on a line lacking that container's prefix",
    // Their F4: "A comment opened inside a quote, callout, or item ends with its container."
    // Its first half is implemented -- a column-0 `%%` cannot close a quoted comment, see
    // `commentQuoteExtentTransform` -- and its second half is recorded there as open: "the
    // quote's own extent is still wrong there, which no corpus case exercises".
    //
    // NO CORPUS CASE, and 482 referee documents hold a container-opened `%%` of which 207
    // disagree, against a 19.8% base rate. A 2.17x lift, the strongest since the tab family,
    // and it survives the base-rate test that killed four earlier selectors.
    //
    // The worked case, `fuzz-20261003.json#1124`:
    //
    //     > > %%              our  blockquote@2-9 holding comment@2-9
    //     > > [^名]: def      obs  the comment ends with its container, at line 3
    //     ⟨blank⟩
    //     2)     [^名]: ...   buried by us, outside the quote for Obsidian
    //
    // Expressed at the LINE rather than at the span, which is what makes it scoreable without
    // re-deriving the burial: a comment whose opener carries `n` quote markers buries only
    // lines carrying at least `n`. Lines 4 onward carry none, so nothing on them is buried and
    // the references we read out of them are ours alone.
    //
    // SCORED, NOT SHIPPED: better 6, worse 28, agreement 5452 -> 5434. Too strict, and the
    // reason is instructive: a container absorbs LAZY lines, so a line lacking the prefix can
    // still be inside the quote. See `comment-burial-ends-at-blank` for the second premise.
    apply: (text, ours, tree) => {
      const lines = text.split("\n");
      const markersOf = (line: string): number => {
        let count = 0;
        let rest = line.replace(/^[ \t]+/u, "");
        while (rest.startsWith(">")) {
          count += 1;
          rest = rest.slice(1).replace(/^[ \t]?/u, "");
        }
        return count;
      };

      /** Line ranges a container-opened comment covers but does NOT bury. */
      const notBuried: Array<[number, number]> = [];
      const walk = (node: unknown): void => {
        const self = node as {
          type?: string;
          position?: { start: { line: number }; end: { line: number } };
          children?: unknown[];
        };
        if (self.type === "comment" && self.position) {
          const openerLine = self.position.start.line - 1;
          const need = markersOf(lines[openerLine] ?? "");
          if (need > 0) {
            for (
              let line = openerLine + 1;
              line <= self.position.end.line - 1;
              line++
            ) {
              if (markersOf(lines[line] ?? "") < need) {
                notBuried.push([line, line]);
              }
            }
          }
        }
        for (const child of self.children ?? []) walk(child);
      };
      walk(tree);

      const loose = new Set(notBuried.map(([line]) => line));
      return {
        defs: ours.defs,
        refs: ours.refs.filter((r) => !loose.has(r[1])),
      };
    },
  },
  {
    name: "def-end-trim-empty",
    what: "a definition's end is pulled back off trailing EMPTY lines only",
    // The narrowing `definition-blank-tail.ts` forces. That pass deliberately EXTENDS a
    // definition over a trailing WHITESPACE-ONLY line (`/^[ \t]+$/`), measured against the
    // app: `[^1]:` over six spaces is one definition covering them. A candidate trimming
    // every line whose `.trim()` is empty would undo that, so this one trims only lines that
    // are truly empty and the two rules cannot touch the same line.
    apply: (text, ours) => {
      const lines = text.split("\n");
      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          let end = d[3];
          while (end > d[1] && (lines[end] ?? "") === "") end -= 1;
          return end === d[3] ? d : [d[0], d[1], d[2], end];
        }),
      };
    },
  },
  {
    name: "def-end-trim-blank",
    what: "a definition's end is pulled back off trailing blank lines",
    // The single largest POSITIONAL family on the referee: grouping the 1,415 disagreeing
    // documents by what differs rather than by their text gives 72 shapes with 82% in the top
    // ten, and `def-end+1` alone is 107 of them, `def-end-1` 57 and `def-end+2` 32.
    //
    // Their comparator normalises both sides here -- `trimmedEnd` strips trailing blanks from
    // the reader's end and `lastLine` pulls an end at column 0 of a later line back one -- so
    // the question this answers is whether OUR end is simply late by the trailing blanks.
    //
    // SCORED AND SHIPPED: better 48, worse 0, agreement 5403 -> 5439. The implementation
    // delivered exactly that -- referee +36 with ZERO documents lost -- and it was NOT a new
    // rule. `definitionTrimTransform` already carried it and applied it once: its blank loop
    // declines when the end line holds content, the column fallback then pulls back one line
    // and EXPOSES blanks that loop never saw. Re-testing after the fallback is the whole fix.
    apply: (text, ours) => {
      const lines = text.split("\n");
      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          let end = d[3];
          while (end > d[1] && (lines[end] ?? "").trim() === "") end -= 1;
          return end === d[3] ? d : [d[0], d[1], d[2], end];
        }),
      };
    },
  },
  {
    name: "nested-container-definition-column",
    what: "a column-0 definition in ANY nested container sits at 2 per level above one",
    // The rule `definition-column.ts` records at its early return, confirmed over three
    // depths against live 1.14.4 rather than inferred:
    //
    //     > [!note] title     / [^1]: def    column 0   (we already agree)
    //     > > [!note] title   / [^1]: def    column 2
    //     > > > [!note] title / [^1]: def    column 4
    //
    // Scored rather than built because that early return guards EVERY root definition --
    // correctly column 0 -- so the firing condition has to tell "absorbed into a nested
    // container" from "at root" with no prefix on the line to key on. One compose row
    // against that blast radius needs a number first.
    //
    // SCORED, NOT SHIPPED: better 0, worse 5, agreement 5389 -> 5384.
    apply: (text, ours, tree) => nestedColumn(text, ours, tree, NESTING_ANY),
  },
  {
    name: "nested-quote-definition-column",
    what: "...the same, counting only quotes and callouts as nesting",
    // The narrowing the first scoping's own counter-examples asked for. All five of its
    // `worse` documents nest through a LIST -- `10.`, `*`, `1.` -- and want column 0, while
    // every measured case nests through QUOTES. That is the list/quote asymmetry this
    // harness records as a class of exactly four, met again.
    //
    // SCORED, NOT SHIPPED: better 0, worse 0, TOUCHED 0 of 6,818 -- NOT ADJUDICABLE.
    //
    // So the referee holds no document where a column-0 definition sits inside depth-two
    // quote nesting, and cannot say the rule is safe OR unsafe. That is the fourth verdict
    // doing its job: reporting this as "net negative" would read as evidence against a rule
    // the corpus simply has no opinion about.
    //
    // Which leaves ONE compose row as the entire evidence for it, against an early return
    // backed by twelve recorded probes that correctly puts every root definition at column
    // 0. Declining on those terms is the same trade as the quote-tab rule beside it.
    apply: (text, ours, tree) => nestedColumn(text, ours, tree, NESTING_QUOTE),
  },
  {
    name: "contained-definition-ends-on-own-line",
    what: "a definition absorbed as a container's lazy content ends at its OWN line",
    // The single rule behind EIGHT of the thirteen remaining `compose.mts` rows, which had
    // been filed as two unrelated families -- six `> comment` rows and two
    // `> footnote > indented` rows. Dumping the trees is what joined them:
    //
    //     > quote / [^1]: def / ⟨4 spaces⟩code      obs  blockquote@0, code@2, paragraph@4
    //                                               ours blockquote@0 swallowing both
    //     - item / [^1]: def / %%                   obs  list@0, comment@2
    //                                               ours list@0 swallowing both
    //
    // UPSTREAM already spans the definition over BOTH lines -- bare `remark-parse` +
    // `remark-gfm` gives `footnoteDefinition@1-2` before any pass here runs -- so the third
    // line is the definition's own continuation and our container then absorbs the lot.
    // Obsidian instead ends the definition at line 1 and starts a ROOT block at line 2,
    // which its `defs` states directly: `1@1:0-1` against our `1@1:0-2`.
    //
    // So `comment` and `indented` were never the axis; what the split-off line BECOMES
    // differs and the rule producing it is identical. That also explains why the absorption
    // map is clean at 0 of 80 while these diverge: the per-type guard is right, and the
    // continuation never reaches it.
    //
    // Scored here because closing it means surgery in `containerLazyTransform`'s
    // `footnoteDefinition` absorption, which carries 43 referee documents -- the single
    // largest landed move on that oracle. This is the measurement that says whether
    // truncating a contained definition costs any of them.
    //
    // SCORED, REFUTED AS STATED: better 102, worse 495, agreement 5389 -> 5046.
    //
    // "Inside a container" is the wrong premise, and the counter-examples say so plainly:
    // `> [!note]` / `> [^a$]: laborum est` / `>   more` wants the definition to end on line
    // 4 and this truncates it to 3. Those definitions are PREFIXED -- written with the
    // container's own marker -- so they are genuinely inside it with real multi-line
    // content, which is a different thing from a column-0 definition the container absorbed
    // LAZILY. See the narrowed rule below.
    apply: (text, ours, tree) => {
      const depthOf = depthsByLine(tree, NESTING_ANY);
      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          if ((depthOf.get(d[1]) ?? 0) < 1) return d;
          return d[3] === d[1] ? d : [d[0], d[1], d[2], d[1]];
        }),
      };
    },
  },
  {
    name: "lazy-definition-ends-on-own-line",
    what: "...the same, only for an UNPREFIXED definition the container absorbed lazily",
    // The narrowing the broad rule's own counter-examples asked for: the label must begin at
    // column 0 LITERALLY, which is what makes it lazy continuation rather than container
    // content. Every `compose.mts` row behind this has the bracket as its line's first
    // character, and every counter-example above carries a `>` prefix.
    //
    // That is the SECOND candidate tonight whose first scoping conflated "in a container"
    // with "at column 0 inside one" -- the nested-column rule made the identical mistake
    // with `/^[ \t>]/`. A container-membership test is not a lazy-continuation test, and the
    // tree says the first while only the line says the second.
    apply: (text, ours, tree) => {
      const lines = text.split("\n");
      const depthOf = depthsByLine(tree, NESTING_ANY);
      return {
        refs: ours.refs,
        defs: ours.defs.map((d): Def => {
          if ((depthOf.get(d[1]) ?? 0) < 1) return d;
          if (!(lines[d[1]] ?? "").startsWith("[")) return d;
          return d[3] === d[1] ? d : [d[0], d[1], d[2], d[1]];
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

  // Three outcomes, not two. A rule that touches nothing, or trades evenly, is NEITHER
  // positive nor negative, and labelling it "net negative" reads as evidence against a rule
  // the corpus simply cannot adjudicate -- which is exactly the state
  // `container-comment-swallows-defs` is in at zero documents touched.
  const verdict =
    better > worse
      ? "NET POSITIVE"
      : better < worse
        ? "net negative"
        : better + worse === 0
          ? "NOT ADJUDICABLE -- touches nothing"
          : "even trade";
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
