import { resolveEscapes } from "./character-escapes.js";
import type { Paragraph, Root, RootContent, Text } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

import { span } from "./normalize-points.js";

interface CommentNode {
  readonly type: "comment";
  readonly position?: {
    readonly start: { readonly offset?: number };
    readonly end: { readonly offset?: number };
  };
}

/**
 * `comment` is this package's own node and is not in mdast's block-content
 * union, so a definition's children are not typed to admit one even though
 * the tokenizer puts them there.
 */
const isComment = (node: unknown): node is CommentNode =>
  (node as { type?: string } | undefined)?.type === "comment";

/** A footnote definition's continuation indent: four spaces, or the tab it stands for. */
const CONTINUATION_INDENT = /^(?: {1,4}|\t)/u;

/**
 * The comment's source as one text node per line, indent excluded, spans exact.
 *
 * A container's indent is structure, not content, and folding the raw slice in as
 * a single node keeps it. The `footnoteDefinition` handler then indents that value
 * a second time on the way out, so `    b` is written at eight columns; the leading
 * space of the doubled run is encoded as `&#x20;` to preserve it, and the `&` of
 * *that* is escaped on the pass after. Each round adds four columns and a backslash
 * run, without bound -- a 48-byte definition reaches 12kB in eleven passes.
 *
 * Stripping the indent out of one whole-span node fixes the growth and costs worse:
 * `hunt/obsidian-comments/23` carries a `[^2]` inside the comment, and removing four
 * characters from a value whose position still spans them shifts every offset derived
 * from it. That showed up as `footnoteRefs` 3 -> 4 and three unplaced counters, and a
 * wrong offset is worse than a missing one.
 *
 * So the split is per line, each segment spanning exactly the characters it holds,
 * with a `break` over each line ending -- the same reason `legacy-scan.ts` gives every
 * line ending its own token and `blank-label-reference.ts` splits before
 * `remark-breaks` can. `commentQuoteExtentTransform` strips `>` from its continuation
 * lines for the same underlying reason; it needs no spans because it rebuilds a value
 * the tokenizer owns.
 */
/** Extends a parent's end to its last positioned child, never past it. */
function syncEnd(host: Paragraph): void {
  const end = host.position?.end;
  if (!end) return;
  for (const child of host.children) {
    const childEnd = child.position?.end;
    if (!childEnd || childEnd.offset === undefined) continue;
    if (end.offset === undefined || childEnd.offset > end.offset) {
      host.position!.end = { ...childEnd };
    }
  }
}

function pushCommentLines(
  host: Paragraph,
  source: string,
  from: number,
  to: number,
  reparse?: (markdown: string) => Root,
): void {
  const lines = source.slice(from, to).split("\n");
  let cursor = from;

  for (let offset = 0; offset < lines.length; offset++) {
    const line = lines[offset] ?? "";
    if (offset > 0) {
      host.children.push(lineEnding(source, cursor - 1, cursor));
    }
    const indent =
      offset === 0 ? 0 : (CONTINUATION_INDENT.exec(line)?.[0].length ?? 0);
    const contentTo = cursor + line.length;
    const written = line.slice(indent);
    // Re-parsed so a construct inside the comment still forms. `metadataCache`
    // indexes a reference written inside a `%%` even though nothing renders, which
    // is the recorded asymmetry -- `[^1]: **` / `····%%note` / `····[[target]]`
    // reports `links: ["target"]` with an empty rendered document, because the
    // definition is unreferenced. Folding the line to literal text lost the wikilink
    // and there was nothing left for `metaOurs` to index.
    //
    // Kept literal unless the re-parse yields something other than one bare text
    // node, which is what protects the eleven matching cases in this family: a line
    // like `%%note` or `b` re-parses to a single text node and takes the literal
    // path exactly as before, so only a line that really holds a construct changes.
    // `%%note` cannot re-form a comment either -- it has no closer.
    let placed = false;
    if (reparse && written !== "") {
      const parsed = reparse(written);
      const body = parsed.children[0];
      if (parsed.children.length === 1 && body?.type === "paragraph") {
        const kids = body.children as unknown as Text[];
        if (!(kids.length === 1 && kids[0]?.type === "text")) {
          shiftAll(kids, cursor + indent);
          host.children.push(...(kids as unknown as Paragraph["children"]));
          placed = true;
        }
      }
    }
    if (!placed) {
      host.children.push(
        span<Text>(
          { type: "text", value: resolveEscapes(written) } as Text,
          source,
          cursor + indent,
          contentTo,
        ),
      );
    }
    cursor = contentTo + 1;
  }
}

/**
 * A `%%` never ends a footnote definition.
 *
 * Obsidian recognises the definition first, so a `%%` inside one cannot open
 * a block comment — `[^1]: a` / `%%` / `b` is a single definition holding
 * three lines of prose. We open a comment there instead, which ends the
 * definition early and leaves the line after it as a paragraph of its own.
 *
 * The comment becomes the text it was written as and the lazily continued
 * lines are folded back in, which is the same repair the interrupt pass makes
 * for a definition that a following block would otherwise cut short.
 */
export function commentInDefinitionTransform(
  tree: Root,
  source: string,
  reparse?: (markdown: string) => Root,
): void {
  if (source === "") return;

  // ROOT CHILDREN ONLY, and that is a measured gap rather than a choice. A definition
  // absorbs each following line until a blank one, whatever contains it -- asked of a
  // running Obsidian directly, `> [^1]: def` / `> %%` / `> x` / `> %%` is ONE definition
  // ending at 3:4, and the unquoted `[^1]: def` / `%%` / `x` / `%%` ends at 3:2 the same
  // way. Seven shapes agree and the `%%` is not special, including `> %% y %%` on one line.
  //
  // Five of the seven already match. The two that do not are the quoted MULTI-LINE comment:
  // at root a `%%` after a definition folds into the definition's own paragraph, so the
  // comment ends up among its children and the test below finds it, while inside a quote
  // the comment forms as the definition's SIBLING and this loop never reaches it -- so the
  // definition stops at its first line, 0:11 against Obsidian's 3:4. A single `> %%` works
  // only because nothing cut it loose to begin with.
  //
  // Two attempts are reverted rather than left in. Widening the host list to every
  // container is INERT, because the trigger needs a comment among the definition's children
  // and the quoted one is a sibling. Adding a sibling branch needs the adjacency test to
  // accept an EMPTY gap -- the definition's end usually sits exactly at the comment's start,
  // so testing for a line ending makes that inert too -- and the version that got that far
  // left type errors behind, which is where it was stopped.
  //
  // A WORKING version exists and is reverted on measurement, and the diagnosis is complete
  // enough that the next attempt should not re-derive it. Three things are needed and all
  // three are easy to mistake for inert:
  //
  //   1. The host list widened to every container, since a quoted definition is never a
  //      root child.
  //   2. A sibling branch: if the definition's last child is not a comment, take the NEXT
  //      SIBLING when it is one and the gap between them is empty or a single line ending
  //      with the quote's prefix stripped. The gap is usually EMPTY -- the definition's end
  //      sits exactly at the comment's start -- so testing only for a line ending makes the
  //      whole branch inert.
  //   3. The DEFINITION's own end moved to the folded comment's end. `syncEnd` below extends
  //      the paragraph and the while loop extends the definition only for blocks IT absorbs,
  //      so without this the definition still ends at its first line while its paragraph
  //      covers the comment.
  //
  // Any one or two of those alone measures as no change, which is how this took four
  // attempts: the branch was demonstrably REACHED -- instrumented, `next=comment
  // defEnd=14` -- while the output stayed identical.
  //
  // With all three, six of the seven measured shapes match where five did. The seventh is
  // `> [^1]: def` / `> %%` / `> x`, an UNCLOSED comment whose end `commentQuoteExtentTransform`
  // extends to the quote's end 79 lines later in `src/index.ts` -- so this pass folds the
  // pre-extension span and ends the definition at 1:4 where Obsidian says 2:3. Closing that
  // needs this pass to run after that one, which is a large reorder; `pass-order.mts` reports
  // this pass as position-sensitive in both directions.
  //
  // Measured: 0 parity regressions, and the referee 78.3% -> 78.2%, four documents lost for
  // one live-confirmed shape gained. The referee has been sampled against live Obsidian and
  // is not stale, so that is a real loss and the trade is refused. The attempt is kept at
  // /tmp only; what ships is this note.
  const children = tree.children;
  for (let index = 0; index < children.length; index++) {
    const definition = children[index];
    if (definition?.type !== "footnoteDefinition") continue;

    // Typed `unknown` deliberately: narrowing a value of mdast's block-content
    // union to `comment` intersects to `never`, since the union does not admit
    // this package's own node even though the tokenizer puts one there.
    const last: unknown = definition.children[definition.children.length - 1];
    if (!isComment(last)) continue;

    // The paragraph straight above the comment, one line ending away. Taking the FIRST paragraph
    // folded `[^1]: a` / blank / `····b` / blank / `····%%note` into `a`, across a blank line and
    // over `b`, so the paragraph's span overlapped `b`'s (the million-seed census); after a blank
    // line the comment is a block of its own, as `legacy` reads it.
    const above = definition.children[definition.children.length - 2];
    if (above?.type !== "paragraph") continue;
    const host = above as Paragraph;
    const hostEnd = host.position?.end?.offset;
    const commentStart = last.position?.start?.offset;
    if (
      hostEnd === undefined ||
      commentStart === undefined ||
      !/^\r?\n[ \t>]*$/u.test(source.slice(hostEnd, commentStart))
    ) {
      continue;
    }

    // The comment is prose again, spelled as the source spelled it.
    const from = last.position?.start?.offset;
    const to = last.position?.end?.offset;
    definition.children.pop();
    // The text covers the comment's own span, so it reproduces the characters
    // it claims; the break covers the newline before it.
    host.children.push(
      lineEnding(source, from === undefined ? undefined : from - 1, from),
    );
    if (from === undefined || to === undefined) {
      host.children.push({ type: "text", value: "%%" } as Text);
    } else {
      pushCommentLines(host, source, from, to, reparse);
    }

    // Then every block the comment cut loose, while each is still lazy
    // continuation: one newline between, never a blank line.
    while (index + 1 < children.length) {
      const next = children[index + 1];
      const gapFrom = definition.position?.end?.offset;
      const gapTo = next?.position?.start?.offset;
      if (
        next?.type !== "paragraph" ||
        gapFrom === undefined ||
        gapTo === undefined ||
        source.slice(gapFrom, gapTo) !== "\n"
      ) {
        break;
      }
      host.children.push(lineEnding(source, gapFrom, gapTo), ...next.children);
      if (definition.position && next.position) {
        definition.position.end = { ...next.position.end };
      }
      children.splice(index + 1, 1);
    }

    // The host's own end, last, once every push into it is done.
    //
    // This pass folds a comment's lines back into a paragraph and extended the
    // DEFINITION's end for each block it absorbed while leaving the paragraph where it
    // was, so `[^1]: one` / `%%` / blank / `use[^1]` gave `paragraph[6..9]` holding
    // children out to 12. 92 of the span checker's 142 violations were that, in two
    // shapes -- the folded `text` and the `break` before it -- and they are one defect
    // counted twice.
    //
    // A node's span has to cover its children, which is the invariant the gate asserts and
    // the reason `obsidian-linter` can order edits at all. Only the end moves, and only
    // forward to a child the paragraph already holds.
    mergeText(host);
    syncEnd(host);
  }
}

/**
 * A soft line ending, as text -- the way micromark leaves one inside any paragraph. This pass
 * used to build a `break`, which turned every folded line into a hard break under `strict`, where
 * `positionedBreaks` is off; `breakPositionsTransform` makes the positioned `break` when it is on.
 */
function lineEnding(
  source: string,
  from: number | undefined,
  to: number | undefined,
): Text {
  return span<Text>(
    {
      type: "text",
      value:
        from === undefined || to === undefined ? "\n" : source.slice(from, to),
    },
    source,
    from,
    to,
  );
}

/** Adjacent text children as one, so the folded paragraph reads as micromark would build it. */
function mergeText(host: Paragraph): void {
  const merged: RootContent[] = [];
  for (const child of host.children) {
    const last = merged[merged.length - 1];
    if (last?.type === "text" && child.type === "text") {
      last.value += child.value;
      if (last.position && child.position) {
        last.position = { start: last.position.start, end: child.position.end };
      }
      continue;
    }
    merged.push(child);
  }
  host.children = merged as Paragraph["children"];
}

/** Every position in `nodes` moved by `base`; a fragment's offsets are relative to its own start. */
function shiftAll(nodes: readonly RootContent[], base: number): void {
  for (const node of nodes) {
    visit(node as Node, (child: Node) => {
      const position = child.position;
      if (!position) return;
      for (const point of [position.start, position.end]) {
        point.offset = base + (point.offset ?? 0);
      }
    });
  }
}
