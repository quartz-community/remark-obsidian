import { defaultHandlers } from "mdast-util-to-markdown";
import type { Info, Options, State } from "mdast-util-to-markdown";
import type { Break, Heading, Parents } from "mdast";
import { EXIT, visit } from "unist-util-visit";
import { toString } from "mdast-util-to-string";

/**
 * Write a line break as a newline rather than a trailing backslash.
 *
 * In a chain that includes `remark-breaks` -- which Quartz pins, and which
 * this package is built for -- every soft line ending becomes a `break`, so a
 * `break` means "there was a line ending here" and a newline writes it back
 * exactly. The default spelling, a trailing backslash, asserts a hard break
 * the source never contained, and it does two kinds of damage.
 *
 * It churns: every multi-line paragraph gains a backslash the first time it is
 * formatted. And inside a construct whose content this package reads literally
 * it never settles -- the legacy highlight and emphasis scans consult raw
 * codes rather than CommonMark's escape rules, so `==text\==` keeps `text\`
 * as content, which is measured Obsidian behaviour. `==a` / `b==` therefore
 * serialises to `==a\` / `b==`, re-parses as the text `a\` plus a break,
 * and grows another backslash on every pass. That single loop accounted for
 * 55 of the corpus's unsettled documents.
 *
 * `escapedLineBreaks` restores the default for a consumer whose chain has no
 * `remark-breaks`, where a `break` really is a hard break and a newline would
 * lose it.
 */
export function breakToMarkdown(escaped = false): Options {
  return {
    handlers: {
      // A heading over two lines must be setext, and the writer writes setext only when its text
      // is non-empty: one of footnote references and a break holds no text by `toString`, so it
      // was written `# [^1]` / `[^1]`, a heading and a paragraph (8 seeds of the million-seed
      // census, under "formatting keeps the tree").
      heading(
        node: Heading,
        parent: Parents | undefined,
        state: State,
        info: Info,
      ) {
        let lines = false;
        visit(node, (child) => {
          if (
            child.type === "break" ||
            /[\r\n]/u.test(
              ((child as { value?: unknown }).value as string) ?? "",
            )
          ) {
            lines = true;
            return EXIT;
          }
          return undefined;
        });
        if (!lines || node.depth >= 3 || toString(node) !== "") {
          return defaultHandlers.heading(node, parent, state, info);
        }
        // Upstream's setext branch, which its own test never reaches here.
        const exit = state.enter("headingSetext");
        const subexit = state.enter("phrasing");
        const value = state.containerPhrasing(node, {
          ...info,
          before: "\n",
          after: "\n",
        });
        subexit();
        exit();
        const lastLine =
          Math.max(value.lastIndexOf("\r"), value.lastIndexOf("\n")) + 1;
        return `${value}\n${(node.depth === 1 ? "=" : "-").repeat(
          Math.max(value.length - lastLine, 3),
        )}`;
      },
      break(node: Break, parent: Parents | undefined, _state: State): string {
        // Except where a break opens emphasis or strong: the writer encodes an edge line
        // ending as `&#xA;`, after which a tag cannot start, so `**` / `#a/b …**` lost its tag
        // (found by `fuzz/invariant-sweep.ts`). A backslash is no whitespace and is left alone,
        // and remark-parse 8 reads `**\` / `#a/b**` as the same strong.
        const opens =
          (parent?.type === "emphasis" || parent?.type === "strong") &&
          parent.children[0] === node;
        const ending = escaped || opens ? "\\\n" : "\n";
        // An empty strikethrough at a line start is written `~~~~`, a fence: remark-parse 8 reads
        // `wor` / `········~~~~d` as one, and the line's indent is what kept it so (the
        // million-seed census). It is written after an encoded space instead.
        const siblings = (parent?.children ?? []) as Array<{
          type: string;
          children?: unknown[];
        }>;
        const next = siblings[siblings.indexOf(node as never) + 1];
        if (next?.type === "delete" && (next.children ?? []).length === 0) {
          return `${ending}&#x20;`;
        }
        return ending;
      },
    },
  };
}
