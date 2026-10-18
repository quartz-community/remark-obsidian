import type { Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** A footnote or link label starting a line, which is what E1 calls "another label". */
const LABEL = /^\[\^?[^\]]*\]:/u;
/**
 * A run of quote markers, each consuming at most one following SPACE -- never a tab.
 *
 * A tab after the marker puts the line's content four columns in, where it is indented code,
 * so whatever follows is not a block opener. 30 probes, six separators by five openers:
 *
 *     sep      marker     label      deeper     heading    fence
 *     `⟨1sp⟩`  0..0|0..0  0..0|0..0  0..0|0..0  0..0|0..0  0..0|0..0
 *     `⇥`      0..1|0..0  0..1|0..0  0..1|0..0  0..1|0..1  0..1|0..1
 *     `⟨2sp⟩`  0..0|0..0  ... every space separator agrees ...
 *
 * Obsidian EXTENDS the definition over a tab-separated marker or label where this pass ended
 * it, and the heading and fence columns agreeing are the controls. Consuming `[ \t]?` here
 * made `>⇥- item` strip to `- item`, which the opener test then matched -- so the shipped rule
 * was ending a definition that Obsidian carries on. Found as the largest cluster of the
 * `def-span-shorter` shrink, 34 forms over 36 documents.
 */
const QUOTE_PREFIX = /^[ \t]*(?:> ?)+/u;

/** How many quote markers a line opens with, each consuming at most one following space. */
function quoteDepth(line: string): number {
  let rest = line.replace(/^[ \t]+/u, "");
  let depth = 0;
  while (rest.startsWith(">")) {
    depth += 1;
    rest = rest.slice(1);
    if (rest.startsWith(" ") || rest.startsWith("\t")) rest = rest.slice(1);
  }
  return depth;
}
/**
 * A quoted line whose content opens a new block: a list marker, a footnote label, or a `>`.
 *
 * Scored `better 5 / worse 0` on top of the marker-and-label rule and worth +7 referee
 * documents, so the same rule reaching one more opener rather than a new one.
 *
 * NOTE that this does NOT catch a nested quote, and making it do so was measured and refused.
 * The prefix strip above consumes the whole marker run, so `> > deep` becomes `deep` and opens
 * nothing -- the probe that suggested the `>` never fires. Comparing at the definition's own
 * quote DEPTH instead, so a deeper line ends it, gains that one probe and costs 62 referee
 * documents and a corpus case. The `>` earns its place on other shapes entirely.
 */
const QUOTED_BLOCK_OPENER =
  /^ {0,3}(?:(?:[-*+]|\d{1,9}[.)])[ \t]|\[\^[^\]]*\]:|>)/u;

interface Point {
  line: number;
  column: number;
  offset?: number;
}

/**
 * A definition ends before a column-0 label line.
 *
 * E1 lists what ends a definition's text and "another label" is on it. Classifying the SURPLUS
 * line over all 113 `def-end+1` entries -- the line we absorb and Obsidian does not -- shows
 * how much of that family it accounts for:
 *
 *     39  text          lazy continuation, correct to absorb per E1
 *     38  definition    E1: another label ENDS a definition
 *     30  bullet        E1: list items end it
 *     10  heading       E1: ATX headings end it
 *      7  comment       D5: `%%` is lazy text, correct to absorb
 *      7  fence         E1: fences end it
 *
 * COLUMN 0 ONLY, which keeps it clear of the indentation argument: an indented label is the
 * definition's own content, and E1's enders are stated for a line that starts a block of its
 * own.
 *
 * THE ORPHANED CHILD IS THE REASON THIS WAS REFUSED TWICE, and it is solvable. In
 * `probes.json#388`, `[^9]: orphan` / `⟨4sp⟩<!--` / `[^1]: one` / `-->`, the first definition
 * ends on the label's own line and its indented `<!--` child extends into that line too, so
 * pulling the parent's end back alone leaves `child ENDS AFTER parent` for
 * `invariants.test.ts`. A guard that simply declined on that measured 0 gained and 0 lost --
 * the pass went inert. Clamping every descendant instead is the same descent discipline
 * `definition-math-absorb.ts` applies upward: a span is not corrected until every node on the
 * path is.
 *
 * AND THE TRADE IS SMALL AND REAL: referee 2 gained, 1 lost, agreement +1. The loss is
 * `broad-20261004.json#330`, where `["3",9,0,11]` matched the oracle and becomes
 * `["3",9,0,10]` -- an agreeing document, carried rather than hidden. It ships because
 * AGREEMENT RISES, which is the standard `definition-math-absorb.ts` set at 21 gained against
 * 10 lost; an earlier refusal here read `better/worse` instead and got the sign of the
 * decision wrong.
 */
export function definitionEndBeforeLabelTransform(
  tree: Root,
  source: string,
): void {
  if (source === "") return;

  const lines = source.split("\n");
  visit(tree, "footnoteDefinition", (node: Node) => {
    const start = node.position?.start;
    const end = node.position?.end;
    if (!start || !end) return;

    const ownDepth = quoteDepth(lines[start.line - 1] ?? "");
    for (let line = start.line; line < end.line; line++) {
      const text = lines[line] ?? "";
      // A QUOTED line ends it too, and on a WIDER set of openers.
      //
      // Fourteen probes on quoted-definition extent, eleven agreeing. We already end a quoted
      // definition at a quoted heading and a quoted fence; the gap is the other two block
      // openers, and the agreeing probes are what make this one rule rather than two
      // exceptions:
      //
      //     "> [^1]: def" / "> # head"      obs 0..0   ours 0..0   already right
      //     "> [^1]: def" / "> ```"         obs 0..0   ours 0..0   already right
      //     "> [^1]: def" / "> - item"      obs 0..0   ours 0..1   this
      //     "> [^1]: def" / "> [^2]: two"   obs 0..0   ours 0..1   this
      //
      // Scored `better 34 / worse 10` for +22 referee documents. Excluding callouts is a
      // derived narrowing -- a callout is a distinct node type with its own extent rules --
      // and it was MEASURED AND REFUSED at 21/5 for +15: the exclusion halves the losses and
      // costs thirteen gains, so the callout cases belong in the rule.
      const inner = text.replace(QUOTE_PREFIX, "");
      if (inner !== text) {
        // A line DEEPER than the definition's own quote ends it, ADDITIVELY -- every other
        // line keeps the behaviour below unchanged.
        //
        // The prefix strip consumes the whole marker run, so `> > quoted` becomes `quoted` and
        // opens nothing: the biggest cluster of the `def-span-longer` shrink, 43 forms over 44
        // documents, is exactly these depth transitions. REPLACING the strip with a depth
        // comparison -- deeper ends, shallower continues, equal tests the opener -- costs 62
        // referee documents and a corpus case. Adding only the deeper branch scores
        // `better 20 / worse 1` for +12, which isolates the damage to the other two branches.
        // `ownDepth > 0` is load-bearing and was omitted once. A ROOT definition has depth 0,
        // so without it every quoted line below one counts as "deeper" and ends it -- which is
        // not the rule and costs the same 62 documents the replacement version did. The
        // candidate carried the guard; the first transcription of it into this pass did not,
        // and the two measured identically wrong.
        const deeper = ownDepth > 0 && quoteDepth(text) > ownDepth;
        if (!deeper && !QUOTED_BLOCK_OPENER.test(inner)) continue;
      } else {
        // An INDENTED label is content, not an ender.
        if (/^[ \t]/u.test(text)) continue;
        if (!LABEL.test(text)) continue;
      }

      let offset = 0;
      for (let at = 0; at < line - 1; at++) {
        offset += (lines[at] ?? "").length + 1;
      }
      const previous = lines[line - 1] ?? "";
      const reach: Point = {
        line,
        column: previous.length + 1,
        offset: offset + previous.length,
      };
      if ((end.offset ?? 0) <= (reach.offset ?? 0)) break;

      node.position!.end = { ...reach };
      visit(node, (inner: Node) => {
        const at = inner.position?.end;
        if (!at) return;
        if ((at.offset ?? 0) > (reach.offset ?? 0)) {
          inner.position!.end = { ...reach };
        }
      });
      break;
    }
  });
}
