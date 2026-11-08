import type { Node } from "mdast";
import type { Handle, Options } from "mdast-util-to-markdown";
import { eachBelow } from "../walk.js";

/** The type an empty `delete` is written under, for the length of one serialization. */
const EMPTY_DELETE = "obsidianEmptyDelete";

/**
 * Obsidian reads `~~~~` mid-line as an empty strikethrough, so the parse yields `delete` nodes
 * without children, which GFM never does. `mdast-util-gfm-strikethrough` 2.0.1 writes `delete`
 * as attention, and the writer drops attention without content ("empty attention cannot
 * form"), so a format lost the `~~~~` (the recorded seeds `" wor\n        ~~~~d\n"` and
 * `" _$#\n        ~~~~del~~\n"`, and `fuzz/strikethrough/12`). Until the root is written, those
 * nodes take a type of their own, which `emptyDeleteToMarkdown` writes as `~~~~`, as 2.0.0
 * did; non-empty strikethrough keeps GFM's handler. Returns the function that restores them.
 */
/** Whether `node` is an empty strikethrough, marked or not. */
export function isEmptyDelete(
  node: { type: string; children?: unknown[] } | undefined,
): boolean {
  return (
    node?.type === EMPTY_DELETE ||
    (node?.type === "delete" && (node.children ?? []).length === 0)
  );
}

export function markEmptyDeletes(tree: Node): () => void {
  const marked: Node[] = [];
  const mark = (node: Node): void => {
    const children = (node as { children?: Node[] }).children;
    if (node.type === "delete" && children?.length === 0) {
      (node as { type: string }).type = EMPTY_DELETE;
      marked.push(node);
    }
  };
  mark(tree);
  eachBelow(tree, mark);
  return () => {
    for (const node of marked) (node as { type: string }).type = "delete";
  };
}

export function emptyDeleteToMarkdown(): Options {
  const handle: Handle & { peek: () => string } = Object.assign(
    ((_node, _parent, state, info) => {
      const tracker = state.createTracker(info);
      const exit = state.enter("strikethrough" as never);
      const value = tracker.move("~~") + tracker.move("~~");
      exit();
      return value;
    }) as Handle,
    { peek: () => "~" },
  );
  return { handlers: { [EMPTY_DELETE]: handle } } as Options;
}
