import type { Options, State } from "mdast-util-to-markdown";
import type { Break, Parents } from "mdast";

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
      break(_node: Break, _parent: Parents | undefined, _state: State): string {
        return escaped ? "\\\n" : "\n";
      },
    },
  };
}
