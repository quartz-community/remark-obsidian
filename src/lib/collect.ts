import type { Nodes, Root } from "mdast";
import { visit } from "unist-util-visit";

import type { Wikilink } from "./types.js";

export interface CollectWikilinksOptions {
  /**
   * Restrict results to embeds (`![[…]]`) or to plain links (`[[…]]`).
   * Omit to collect both.
   */
  embedded?: boolean;
}

/**
 * Type guard for the `wikilink` node this plugin adds to mdast.
 */
export function isWikilink(node: unknown): node is Wikilink {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as { type?: unknown }).type === "wikilink"
  );
}

/**
 * Type guard for an embedded wikilink, written `![[target]]`.
 *
 * Embedding is the difference between transcluding a target and merely linking
 * to it, and is the distinction consumers most often need. Keeping the rule
 * here stops each consumer from re-deriving it.
 */
export function isEmbed(node: unknown): node is Wikilink {
  return isWikilink(node) && node.embedded;
}

/**
 * Collect wikilinks from a tree, in document order.
 */
export function collectWikilinks(
  tree: Nodes | Root,
  options: CollectWikilinksOptions = {},
): Wikilink[] {
  const found: Wikilink[] = [];

  visit(tree, "wikilink", (node: Wikilink) => {
    if (options.embedded !== undefined && node.embedded !== options.embedded) {
      return;
    }

    found.push(node);
  });

  return found;
}

/**
 * Collect the target of every embed in a tree, in document order and without
 * duplicates.
 *
 * Obsidian embeds a target with either `![[target]]` or `![](target)`, so both
 * the `wikilink` nodes this plugin adds and mdast's own `image` nodes count.
 * Targets keep their original form, including any heading or block reference;
 * resolving them to files is the caller's concern.
 *
 * Nodes inside fenced code are not embeds and are never returned: fenced code
 * parses to a `code` node whose content is not traversed as phrasing content.
 */
export function collectEmbedPaths(tree: Nodes | Root): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  const add = (value: string): void => {
    const target = value.trim();

    if (target === "" || seen.has(target)) return;

    seen.add(target);
    paths.push(target);
  };

  visit(tree, (node: Nodes) => {
    if (isEmbed(node)) {
      add(node.path);

      return;
    }

    if (node.type === "image") {
      add(node.url);
    }
  });

  return paths;
}
