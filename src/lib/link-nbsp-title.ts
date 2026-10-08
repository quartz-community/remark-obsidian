import type { Root } from "mdast";
import { visit } from "unist-util-visit";

/**
 * A no-break space separates a link's destination from its title.
 *
 * `[link](/url\u00a0"title")` is the destination `/url` with the title `title` to
 * Obsidian. CommonMark says U+00A0 is not whitespace, so micromark reads the whole
 * `/url\u00a0"title"` as one destination and the link indexes that -- which is
 * correct by the spec and wrong about the application.
 *
 * Only an unquoted destination with a quoted run at its end is split, and only on
 * U+00A0, so an ordinary space is left to the tokenizer that already handles it. The
 * title is set as well as the url, because the node should say what Obsidian parsed
 * rather than merely project it: a formatter writing this link back must not reattach
 * the title to the destination.
 *
 * Worth knowing that this cost three attempts to even *see*: every display in the
 * chain renders U+00A0 as a space, so the divergence reads as a link whose
 * destination inexplicably includes its own title. Dump the code points first.
 */
export function linkNbspTitleTransform(tree: Root): void {
  visit(tree, "link", (node) => {
    if (node.title !== null && node.title !== undefined) return;
    const url = node.url;
    if (typeof url !== "string" || !url.includes("\u00a0")) return;

    const at = url.lastIndexOf("\u00a0");
    const head = url.slice(0, at);
    const tail = url.slice(at + 1);
    if (head === "" || tail.length < 2) return;
    const quote = tail[0];
    if (quote !== '"' && quote !== "'") return;
    if (!tail.endsWith(quote)) return;

    node.url = head;
    node.title = tail.slice(1, -1);
  });
}
