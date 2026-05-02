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

import { wikilinkFromMarkdown } from "./lib/mdast/wikilink.js";
import { highlightFromMarkdown } from "./lib/mdast/highlight.js";
import { commentFromMarkdown } from "./lib/mdast/comment.js";
import { tagFromMarkdown } from "./lib/mdast/tag.js";
import { wikilinkToMarkdown } from "./lib/mdast/wikilink-to-markdown.js";
import { highlightToMarkdown } from "./lib/mdast/highlight-to-markdown.js";
import { commentToMarkdown } from "./lib/mdast/comment-to-markdown.js";
import { tagToMarkdown } from "./lib/mdast/tag-to-markdown.js";
import { customTaskCharTransform } from "./lib/task-char.js";

import { math as mathSyntax } from "micromark-extension-math";
import { mathFromMarkdown, mathToMarkdown } from "mdast-util-math";

export interface RemarkObsidianOptions {
  wikilinks?: boolean;
  highlights?: boolean;
  comments?: boolean;
  tags?: boolean;
  customTaskChars?: boolean;
  math?: boolean;
}

const defaultOptions: Required<RemarkObsidianOptions> = {
  wikilinks: true,
  highlights: true,
  comments: true,
  tags: true,
  customTaskChars: true,
  math: true,
};

export default function remarkObsidian(
  userOpts?: RemarkObsidianOptions,
): undefined | ((tree: Root, file: any) => void) {
  const opts = { ...defaultOptions, ...userOpts };
  // @ts-expect-error - unified `this` context
  const data = (this as Processor<Root>).data();

  data.micromarkExtensions ??= [];
  data.fromMarkdownExtensions ??= [];
  data.toMarkdownExtensions ??= [];

  if (opts.wikilinks) {
    data.micromarkExtensions.push(wikilinkSyntax());
    data.fromMarkdownExtensions.push(wikilinkFromMarkdown());
    data.toMarkdownExtensions.push(wikilinkToMarkdown());
  }
  if (opts.comments) {
    data.micromarkExtensions.push(commentSyntax());
    data.fromMarkdownExtensions.push(commentFromMarkdown());
    data.toMarkdownExtensions.push(commentToMarkdown());
  }
  if (opts.tags) {
    data.micromarkExtensions.push(tagSyntax());
    data.fromMarkdownExtensions.push(tagFromMarkdown());
    data.toMarkdownExtensions.push(tagToMarkdown());
  }
  if (opts.highlights) {
    data.micromarkExtensions.push(highlightSyntax());
    data.fromMarkdownExtensions.push(highlightFromMarkdown());
    data.toMarkdownExtensions.push(highlightToMarkdown());
  }
  if (opts.math) {
    data.micromarkExtensions.push(mathSyntax());
    data.fromMarkdownExtensions.push(mathFromMarkdown());
    data.toMarkdownExtensions.push(mathToMarkdown());
  }

  const needsTransform = opts.comments || opts.customTaskChars;
  if (!needsTransform) return undefined;

  return (tree: Root, file: any) => {
    if (opts.comments) {
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
    }
    if (opts.customTaskChars) {
      customTaskCharTransform(tree, String(file));
    }
  };
}

export { wikilinkSyntax } from "./lib/syntax/wikilink.js";
export { highlightSyntax } from "./lib/syntax/highlight.js";
export { commentSyntax } from "./lib/syntax/comment.js";
export { tagSyntax } from "./lib/syntax/tag.js";

export { wikilinkFromMarkdown } from "./lib/mdast/wikilink.js";
export { highlightFromMarkdown } from "./lib/mdast/highlight.js";
export { commentFromMarkdown } from "./lib/mdast/comment.js";
export { tagFromMarkdown } from "./lib/mdast/tag.js";
export { wikilinkToMarkdown } from "./lib/mdast/wikilink-to-markdown.js";
export { highlightToMarkdown } from "./lib/mdast/highlight-to-markdown.js";
export { commentToMarkdown } from "./lib/mdast/comment-to-markdown.js";
export { tagToMarkdown } from "./lib/mdast/tag-to-markdown.js";
export { customTaskCharTransform } from "./lib/task-char.js";

export type { Wikilink, Highlight, Comment, Tag } from "./lib/types.js";
