/// <reference types="remark-parse" />
/// <reference types="remark-stringify" />

import type { Root } from "mdast";
import type { Processor } from "unified";
import { visit } from "unist-util-visit";

import "./lib/types.js";

import { wikilinkSyntax } from "./lib/syntax/wikilink.js";
import { highlightSyntax } from "./lib/syntax/highlight.js";
import { commentSyntax } from "./lib/syntax/comment.js";
import { tagSyntax } from "./lib/syntax/tag.js";
import { arrowSyntax } from "./lib/syntax/arrow.js";

import { wikilinkFromMarkdown } from "./lib/mdast/wikilink.js";
import { highlightFromMarkdown } from "./lib/mdast/highlight.js";
import { commentFromMarkdown } from "./lib/mdast/comment.js";
import { tagFromMarkdown } from "./lib/mdast/tag.js";
import { arrowFromMarkdown } from "./lib/mdast/arrow.js";

export interface RemarkObsidianOptions {
  wikilinks?: boolean;
  highlights?: boolean;
  comments?: boolean;
  tags?: boolean;
  arrows?: boolean;
}

const defaultOptions: Required<RemarkObsidianOptions> = {
  wikilinks: true,
  highlights: true,
  comments: true,
  tags: true,
  arrows: true,
};

export default function remarkObsidian(
  userOpts?: RemarkObsidianOptions,
): undefined | ((tree: Root) => void) {
  const opts = { ...defaultOptions, ...userOpts };
  // @ts-expect-error - unified `this` context
  const data = (this as Processor<Root>).data();

  data.micromarkExtensions ??= [];
  data.fromMarkdownExtensions ??= [];

  if (opts.wikilinks) {
    data.micromarkExtensions.push(wikilinkSyntax());
    data.fromMarkdownExtensions.push(wikilinkFromMarkdown());
  }
  if (opts.comments) {
    data.micromarkExtensions.push(commentSyntax());
    data.fromMarkdownExtensions.push(commentFromMarkdown());
  }
  if (opts.tags) {
    data.micromarkExtensions.push(tagSyntax());
    data.fromMarkdownExtensions.push(tagFromMarkdown());
  }
  if (opts.arrows) {
    data.micromarkExtensions.push(arrowSyntax());
    data.fromMarkdownExtensions.push(arrowFromMarkdown());
  }
  if (opts.highlights) {
    data.micromarkExtensions.push(highlightSyntax());
    data.fromMarkdownExtensions.push(highlightFromMarkdown());
  }

  if (!opts.comments) return undefined;

  return (tree) => {
    visit(
      tree,
      "comment",
      (_node: unknown, index: number | undefined, parent: any) => {
        if (parent && typeof index === "number") {
          parent.children.splice(index, 1);
          return index;
        }
        return undefined;
      },
    );
  };
}

export { wikilinkSyntax } from "./lib/syntax/wikilink.js";
export { highlightSyntax } from "./lib/syntax/highlight.js";
export { commentSyntax } from "./lib/syntax/comment.js";
export { tagSyntax } from "./lib/syntax/tag.js";
export { arrowSyntax } from "./lib/syntax/arrow.js";

export { wikilinkFromMarkdown } from "./lib/mdast/wikilink.js";
export { highlightFromMarkdown } from "./lib/mdast/highlight.js";
export { commentFromMarkdown } from "./lib/mdast/comment.js";
export { tagFromMarkdown } from "./lib/mdast/tag.js";
export { arrowFromMarkdown } from "./lib/mdast/arrow.js";

export type { Wikilink, Highlight, Comment, Tag, Arrow } from "./lib/types.js";
