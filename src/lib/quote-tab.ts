import type { Blockquote, Code, Root } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/** `>` with a tab straight after it, and whatever the tab indents. */
const QUOTE_TAB = /^[ \t]{0,3}>\t(.*)$/u;

/**
 * A tab after a quote marker indents, so the line is code.
 *
 * `remark-parse@8`'s blockquote tokenizer consumes the `>` and then at most one
 * **space**. A tab is not a space, so it survives into the quote's content and
 * supplies a full indent -- four columns, which is an indented code block. Every
 * construct behind such a marker is therefore code to Obsidian, not just a
 * footnote definition:
 *
 *     >\tplain text   -> code
 *     >\t# heading    -> code
 *     >\t- item       -> code
 *     >\t[^1]: def    -> code
 *
 * Verified against the legacy stack Obsidian parses with -- `remark-parse@8`
 * plus `remark-footnotes@2` -- which reports `blockquote > code` for all four,
 * and against a recorded answer for the definition: `>\t[^1]: def` is reported
 * with no definition at all.
 *
 * micromark admits a tab as the marker's own whitespace instead, so it reads
 * each line as the construct it looks like.
 *
 * Only a quote whose every content line is marked this way is rewritten. A
 * mixture would need the lines regrouped into alternating code and prose, and
 * guessing at that split is worse than leaving it recorded as a divergence.
 */
export function quoteTabTransform(tree: Root, source: string): void {
  if (source === "") return;

  visit(tree, "blockquote", (node: Node) => {
    const quote = node as Blockquote;
    const from = node.position?.start?.offset;
    const to = node.position?.end?.offset;
    if (from === undefined || to === undefined) return;

    const lines = source.slice(from, to).split("\n");
    const indented = lines.map((line) => QUOTE_TAB.exec(line));
    if (indented.some((match) => match === null)) {
      mixedQuote(quote, source);
      return;
    }

    const value = indented.map((match) => match![1]!).join("\n");
    const code: Code = {
      type: "code",
      lang: null,
      meta: null,
      value,
      ...(node.position ? { position: node.position } : {}),
    };
    quote.children = [code];
  });
}

/**
 * A quote line carrying a SPACE-separated definition, which establishes the content column.
 *
 * SPACES, not `[ \t]`. A tab-separated label is the very thing that fails to define, so
 * admitting one here lets the exception chain off a failed definition -- `>⇥[^b]: body` / `>` /
 * `>⇥[^c]: more` then reports `c`, where Obsidian reports nothing. That is control four, and
 * it is the whole reason the clause says "space-separated" rather than "earlier".
 */
const ESTABLISHES = /^[ \t]{0,3}> +\[\^[^\]]*\]:/u;

/**
 * The same rule where the quote is a MIXTURE, which is the split this pass used to decline.
 *
 * The all-tab branch above rewrites a quote whose every line is `>⇥`. A mixture was left alone
 * because regrouping the whole quote into alternating code and prose meant guessing. It does
 * not have to be guessed: only the DEFINITION's own line needs to change, and five controls
 * against live 1.14.4 say exactly when:
 *
 *     >⇥[^b]: body                        defs []           we agreed already
 *     >⟨3sp⟩[^b]: body                     defs ["b"]        we agreed already
 *     > text / > / >⇥[^b]: body           defs []           WE DEFINED `b`
 *     >⇥[^b]: body / > / >⇥[^c]: more     defs []           WE DEFINED BOTH
 *     > [^a]: It / > / >⇥[^b]: body       defs ["a","b"]    we agreed already
 *
 * So a tab-indented label defines once the quote ALREADY HOLDS a space-separated definition,
 * and not otherwise -- consistent with that first definition establishing the quote's content
 * column. The fourth control is what makes it "space-separated" rather than merely "earlier":
 * the exception does not chain off a definition that itself never defined.
 *
 * Scored at 47 better / 0 worse before being built, and the two controls we were failing are
 * the two the score is made of. A blunter form that drops EVERY tab-marked definition scores
 * 53/1 and contradicts the fifth control, which is why the establishing clause is in the rule
 * rather than fitted around its losses.
 */
function mixedQuote(quote: Blockquote, source: string): void {
  for (let index = 0; index < quote.children.length; index++) {
    const child = quote.children[index];
    if (child?.type !== "footnoteDefinition") continue;

    const from = child.position?.start?.offset;
    const to = child.position?.end?.offset;
    if (from === undefined || to === undefined) continue;

    const bol = source.lastIndexOf("\n", from - 1) + 1;
    const nl = source.indexOf("\n", bol);
    const own = source.slice(bol, nl === -1 ? undefined : nl);
    const marked = QUOTE_TAB.exec(own);
    if (!marked) continue;

    // Established by an earlier SPACE-separated definition in the same quote run. Walking
    // LINE STARTS backwards, which is `continuesDefinition`'s idiom in `comment-region.ts`:
    // stepping by the line's end instead stalls on a one-character `>` line, because
    // `lastIndexOf("\n", end - 1)` then returns the very newline just stepped over and the
    // slice comes back empty. That cost control five -- `> [^a]: It` / `>` / `>⇥[^b]: body`
    // reported only `a` while the scan never reached the establishing line.
    let established = false;
    let lineStart = bol;
    while (lineStart > 0) {
      const previousEnd = lineStart - 1;
      const previousStart = source.lastIndexOf("\n", previousEnd - 1) + 1;
      const line = source.slice(previousStart, previousEnd);
      if (!/^[ \t]{0,3}>/u.test(line)) break;
      if (ESTABLISHES.test(line)) {
        established = true;
        break;
      }
      lineStart = previousStart;
    }
    if (established) continue;

    const code: Code = {
      type: "code",
      lang: null,
      meta: null,
      // EVERY line loses its quote prefix, not only the `>⇥` ones. A blank quote line is `>`
      // alone, which `QUOTE_TAB` does not match, so falling through to the raw line left a
      // stray marker in the rendered text -- `[^b]: body > [^c]: more` against Obsidian's
      // `[^b]: body [^c]: more`.
      value: source
        .slice(bol, to)
        .split("\n")
        .map(
          (line) =>
            QUOTE_TAB.exec(line)?.[1] ??
            line.replace(/^[ \t]{0,3}>[ \t]?/u, ""),
        )
        .join("\n"),
      ...(child.position ? { position: child.position } : {}),
    };
    quote.children[index] = code;

    // MERGE WITH AN ADJACENT CODE SIBLING. Converting each definition on its own gives two
    // code blocks where Obsidian reports one -- `html.codeLang` was `["",""]` against its
    // `[""]` -- because the quote's own blank line sits between them and belongs to neither.
    const previous = quote.children[index - 1];
    if (previous?.type === "code") {
      const from = previous.position?.start?.offset;
      const gap = previous.position?.end?.offset;
      if (from !== undefined && gap !== undefined) {
        previous.value = source
          .slice(from, to)
          .split("\n")
          .map(
            (line) =>
              QUOTE_TAB.exec(line)?.[1] ??
              line.replace(/^[ \t]{0,3}>[ \t]?/u, ""),
          )
          .join("\n");
        if (previous.position && child.position) {
          previous.position.end = { ...child.position.end };
        }
        quote.children.splice(index, 1);
        index -= 1;
      }
    }
  }
}
