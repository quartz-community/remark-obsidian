import type { Extension } from "mdast-util-from-markdown";
import { resolveTarget, spelledTarget } from "../wikilink-target.js";

/** Which parts the tokenizer actually produced, in the order they appear. */
interface Parts {
  path: boolean;
  heading: boolean;
  alias: boolean;
}

// Only `\#`. Obsidian keeps a backslash before `]` in a target or heading: `[[a\]b]]` links to
// `a\]b` and `[[link\](u)]]` to `link\](u)` (recorded live, 1.15.0; the nightly differential
// fuzz found it). A trailing backslash, `[[a\]]]`, is the one it drops, handled below.
const UNESCAPE = /\\(#)/g;

/**
 * Obsidian trims a wikilink's inner text **once, as a whole**, and only then splits
 * it on `#` and `|`. Trimming each part separately is not the same thing:
 *
 *     [[  Note  #^id  ]]    whole -> `Note  #^id`, so the path is `Note  `
 *                           per-part -> `Note`, losing two spaces Obsidian keeps
 *
 * So the first part present loses its leading whitespace, the last loses its
 * trailing, and anything interior keeps both. `[[ page ]]` and `[[ ]]` are
 * unaffected, since a lone path is both first and last.
 */
function trimParts(
  node: {
    path: string;
    heading: string;
    alias: string;
  },
  parts: Parts,
): void {
  const order: ("path" | "heading" | "alias")[] = [];
  if (parts.path) order.push("path");
  if (parts.heading) order.push("heading");
  if (parts.alias) order.push("alias");
  const first = order[0];
  const last = order[order.length - 1];
  // `trimStart`/`trimEnd` rather than `/^\s+/` and `/\s+$/`: same characters, and
  // the lint rule rejects the trailing form as quadratic. `container-lazy.ts`
  // records the same substitution.
  if (first !== undefined) node[first] = node[first].trimStart();
  if (last !== undefined) node[last] = node[last].trimEnd();
}

export function wikilinkFromMarkdown(): Extension {
  const present = new WeakMap<object, Parts>();
  const partsOf = (node: object): Parts => {
    const found = present.get(node) ?? {
      path: false,
      heading: false,
      alias: false,
    };
    present.set(node, found);
    return found;
  };

  return {
    enter: {
      wikilink(token) {
        this.enter(
          {
            type: "wikilink",
            value: "",
            embedded: false,
            path: "",
            heading: "",
            alias: "",
          },
          token,
        );
        partsOf(this.stack[this.stack.length - 1] as object);
      },
      wikilinkEmbedMarker() {
        const node = this.stack[this.stack.length - 1] as any;
        node.embedded = true;
      },
      wikilinkPath(token) {
        const node = this.stack[this.stack.length - 1] as any;
        node.path = this.sliceSerialize(token).replace(UNESCAPE, "$1");
        partsOf(node).path = true;
      },
      wikilinkHeading(token) {
        const node = this.stack[this.stack.length - 1] as any;
        node.heading = this.sliceSerialize(token).replace(UNESCAPE, "$1");
        partsOf(node).heading = true;
      },
      // The marker, not the content, is what proves an alias was written: the
      // tokenizer emits no `wikilinkAlias` token at all when the alias is empty,
      // so `[[a|]]` would otherwise look exactly like `[[a]]` here.
      wikilinkAliasMarker() {
        const node = this.stack[this.stack.length - 1] as any;
        if (node?.type === "wikilink") partsOf(node).alias = true;
      },
      wikilinkAlias(token) {
        const node = this.stack[this.stack.length - 1] as any;
        node.alias = this.sliceSerialize(token);
        partsOf(node).alias = true;
      },
    },
    exit: {
      wikilink(token) {
        const node = this.stack[this.stack.length - 1] as any;
        trimParts(node, partsOf(node));
        const written = node.path;
        const writtenHeading = node.heading;

        // A trailing backslash is not part of the target: Obsidian resolves
        // `[[target\]]` to `target` while still displaying the backslash. The
        // two therefore have to be carried separately — `path` is what a
        // consumer resolves, `value` is what it should render. A heading needs
        // the same pair as the path: `[[a#^blk\]]` resolves to `^blk` and
        // displays `a > ^blk\`, so rendering from the stripped heading dropped a
        // character Obsidian shows.
        // Only the part touching the closer loses its backslash. `[[target\]]`
        // resolves to `target` and `[[a#^blk\]]` to `^blk`, because in both the
        // backslash is the last character before `]]` -- but in `[[a\#b]]` the
        // backslash is before the `#`, and Obsidian resolves that target as `a\`.
        // Stripping both parts unconditionally lost that character.
        // A no-break space resolves as an ordinary one: `![[*\u00a0*]]` is an
        // embed of the note `* *`. Applied to the resolved target only -- `value`
        // and the source keep the character the author typed, so a formatter
        // cannot quietly rewrite it.
        // Resolved NFC too, as Obsidian resolves it: `[[cafe\u0301]]` links to `caf\u00e9`
        // (found by `fuzz/charclass-sweep.ts`). `value` keeps what the author typed.
        node.path = resolveTarget(node.path);
        node.heading = resolveTarget(node.heading);
        const spelled = spelledTarget(written, writtenHeading, node);
        if (spelled) node.data = { ...node.data, ...spelled };

        // An alias is never stripped, even when it is the part touching the
        // closer: `[[a|b\]]` keeps its `b\`. Only a resolved target loses the
        // character, and an alias resolves to nothing.
        const parts = partsOf(node);
        const resolved = parts.heading
          ? "heading"
          : parts.path
            ? "path"
            : undefined;
        if (resolved !== undefined && String(node[resolved]).endsWith("\\")) {
          node[resolved] = String(node[resolved]).slice(0, -1);
          // Kept for the writer, which builds from the parts: without it `[[target\]]` was
          // written `[[target]]`, a different document (found by `fuzz/invariant-sweep.ts`).
          // Only when the backslash stood before `]]`: before an alias's `|` it is the table
          // escape of `| [[Note\|Alias]] |`, which the writer adds back itself in a cell.
          if (!parts.alias) {
            node.data = { ...node.data, strippedBackslash: resolved };
          }
        }

        // An alias that was *written* wins even when it is empty, which is why
        // this asks `parts` rather than testing `node.alias` for truthiness:
        // `[[a|]]` displays nothing in Obsidian while `[[a]]` displays `a`, and
        // the node carries `alias: ""` for both.
        node.value = node.embedded
          ? node.path
          : partsOf(node).alias
            ? node.alias
            : // The display form splits the heading on *every* `#`, so
              // `[[a#b#c]]` reads `a > b > c`. Only the destination splits on
              // the first one -- `heading` stays `b#c` because that is what a
              // consumer resolves against.
              [written, ...writtenHeading.split("#")]
                .filter(Boolean)
                .join(" > ");
        this.exit(token);
      },
    },
  };
}
