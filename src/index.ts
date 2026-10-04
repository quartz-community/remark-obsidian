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
import { inlineFootnoteSyntax } from "./lib/syntax/inline-footnote.js";
import { legacyEmphasisSyntax } from "./lib/syntax/legacy-emphasis.js";

import { wikilinkFromMarkdown } from "./lib/mdast/wikilink.js";
import { highlightFromMarkdown } from "./lib/mdast/highlight.js";
import { commentFromMarkdown } from "./lib/mdast/comment.js";
import { tagFromMarkdown } from "./lib/mdast/tag.js";
import { inlineFootnoteFromMarkdown } from "./lib/mdast/inline-footnote.js";
import { wikilinkToMarkdown } from "./lib/mdast/wikilink-to-markdown.js";
import { highlightToMarkdown } from "./lib/mdast/highlight-to-markdown.js";
import { commentToMarkdown } from "./lib/mdast/comment-to-markdown.js";
import { tagToMarkdown } from "./lib/mdast/tag-to-markdown.js";
import { inlineFootnoteToMarkdown } from "./lib/mdast/inline-footnote-to-markdown.js";
import { customTaskCharTransform } from "./lib/task-char.js";
import { mathDisplayTransform } from "./lib/math-display.js";
import { taskReparseTransform } from "./lib/task-reparse.js";
import { bareFootnoteRefTransform } from "./lib/footnote-bare.js";
import { footnoteInterruptTransform } from "./lib/footnote-interrupt.js";
import { containerLazyTransform } from "./lib/container-lazy.js";
import { quoteMergeTransform } from "./lib/quote-merge.js";
import { paragraphMergeTransform } from "./lib/paragraph-merge.js";
import { definitionTabTransform } from "./lib/definition-tab.js";
import { fenceOutlivesTransform } from "./lib/fence-outlives.js";
import { mathOutlivesTransform } from "./lib/math-outlives.js";
import { listUnderDefinitionTransform } from "./lib/list-under-definition.js";
import { tableRowStyleTransform } from "./lib/table-row-style.js";
import { tableShortDelimiterTransform } from "./lib/table-short-delimiter.js";
import {
  multilineSetextTransform,
  setextUnderlineTransform,
} from "./lib/setext-underline.js";
import { footnoteLabelTransform } from "./lib/footnote-label.js";
import { tableInterruptTransform } from "./lib/table-interrupt.js";
import { setextDefinitionTransform } from "./lib/setext-definition.js";
import { shortCommentTransform } from "./lib/short-comment.js";
import { lrdFootnoteTransform } from "./lib/lrd-footnote.js";
import {
  legacyDefinitionPromoteTransform,
  legacyDefinitionTransform,
} from "./lib/legacy-definition.js";
import { quoteIndentedCodeTransform } from "./lib/quote-indented-code.js";
import { footnoteTableSplitTransform } from "./lib/footnote-table-split.js";
import { footnoteOrphanTransform } from "./lib/footnote-orphan.js";
import { calloutTransform } from "./lib/callout.js";
import { commentHoistTransform } from "./lib/comment-hoist.js";
import { commentTailTransform } from "./lib/comment-tail.js";
import { commentRegionTransform } from "./lib/comment-region.js";
import { taskCharToMarkdown } from "./lib/mdast/task-char-to-markdown.js";

import { math as mathSyntax } from "micromark-extension-math";
import { mathTextSyntax } from "./lib/syntax/math-text.js";
import { mathFromMarkdown, mathToMarkdown } from "mdast-util-math";
import { frontmatter as frontmatterSyntax } from "micromark-extension-frontmatter";
import {
  frontmatterFromMarkdown,
  frontmatterToMarkdown,
} from "mdast-util-frontmatter";

/** Marker element a kept comment renders as, which `rehype-obsidian` removes. */
export const COMMENT_ELEMENT = "obsidian-comment";

export interface RemarkObsidianOptions {
  wikilinks?: boolean;
  highlights?: boolean;
  comments?: boolean;
  tags?: boolean;
  customTaskChars?: boolean;
  math?: boolean;
  taskReparse?: boolean;
  /**
   * Parse a leading `---` block as YAML frontmatter. On by default because
   * Obsidian always does, and leaving it off is not neutral: the `---` becomes a
   * thematic break or setext heading and the YAML body leaks into the document as
   * a list, so everything downstream sees blocks that are not there. Turn it off
   * only when something earlier in the pipeline has already consumed it.
   */
  frontmatter?: boolean;
  /**
   * Keep `comment` nodes in the tree instead of deleting them, so a consumer can
   * see where `%%` comments are. A linter needs that, and it is what lets a
   * block-level view report a comment at all.
   *
   * The body is still never rendered: each kept node carries `data.hChildren: []`,
   * which makes `mdast-util-to-hast` emit an empty `<obsidian-comment>` element
   * instead of its default for an unknown node with a `value` — a text node
   * holding the comment body. `rehype-obsidian` removes the empty element; a chain
   * without it shows a stray empty tag, never the comment text.
   */
  keepComments?: boolean;
  /**
   * Strip the delimiters from a footnote reference nothing defines, so `see [^x]`
   * reads `see x` as Obsidian renders it. GFM keeps an unmatched reference literal,
   * so this is a deliberate divergence from the spec in favour of matching the app.
   */
  bareFootnoteRefs?: boolean;
  /** Parse Obsidian's `^[body]` inline footnote, which GFM has no form for. */
  inlineFootnotes?: boolean;
  /**
   * Promote `> [!type] Title` blockquotes into `callout` nodes. Obsidian reports
   * these as their own block type, so a blockquote here is a divergence rather
   * than a neutral choice.
   */
  callouts?: boolean;
  /**
   * Parse `*` and `_` the way `remark-parse@8.0.3` does, which is what Obsidian
   * ships, instead of CommonMark's delimiter-run algorithm. The two disagree on
   * every unbalanced run: `***a**` is `<strong>*a</strong>` rather than
   * `*<strong>a</strong>`, `*text**` is not emphasis at all, and `***a***` nests
   * strong outside emphasis rather than the reverse.
   *
   * On by default, because leaving it off is not neutral — it silently produces
   * different emphasis from the app for any such run.
   */
  legacyEmphasis?: boolean;
}

const defaultOptions: Required<RemarkObsidianOptions> = {
  wikilinks: true,
  highlights: true,
  comments: true,
  tags: true,
  customTaskChars: true,
  math: true,
  taskReparse: true,
  frontmatter: true,
  keepComments: true,
  bareFootnoteRefs: true,
  inlineFootnotes: true,
  callouts: true,
  legacyEmphasis: true,
};

export default function remarkObsidian(
  userOpts?: RemarkObsidianOptions,
): undefined | ((tree: Root, file: any) => void) {
  const opts = { ...defaultOptions, ...userOpts };
  // @ts-expect-error - unified `this` context
  const self = this as Processor<Root>;
  const data = self.data();

  data.micromarkExtensions ??= [];
  data.fromMarkdownExtensions ??= [];
  data.toMarkdownExtensions ??= [];

  if (opts.frontmatter) {
    data.micromarkExtensions.push(frontmatterSyntax(["yaml"]));
    data.fromMarkdownExtensions.push(frontmatterFromMarkdown(["yaml"]));
    data.toMarkdownExtensions.push(frontmatterToMarkdown(["yaml"]));
  }
  if (opts.inlineFootnotes) {
    data.micromarkExtensions.push(inlineFootnoteSyntax());
    data.fromMarkdownExtensions.push(inlineFootnoteFromMarkdown());
    data.toMarkdownExtensions.push(inlineFootnoteToMarkdown());
  }
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
    const base = mathSyntax();
    // Upstream applies no flanking rules, so `$5 and $10` parses as math. Keep its
    // block handling and swap in a gated text construct.
    data.micromarkExtensions.push({ ...base, text: { 36: mathTextSyntax() } });
    data.fromMarkdownExtensions.push(mathFromMarkdown());
    data.toMarkdownExtensions.push(mathToMarkdown());
  }

  if (opts.legacyEmphasis) {
    data.micromarkExtensions.push(legacyEmphasisSyntax());
  }

  if (opts.customTaskChars) {
    data.toMarkdownExtensions.push(taskCharToMarkdown());
  }

  const needsTransform =
    opts.comments ||
    opts.customTaskChars ||
    opts.math ||
    opts.taskReparse ||
    opts.bareFootnoteRefs ||
    opts.callouts;
  if (!needsTransform) return undefined;

  return (tree: Root, file: any) => {
    if (opts.comments && !opts.keepComments) {
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
    } else if (opts.comments) {
      commentHoistTransform(tree);
      commentTailTransform(
        tree,
        String(file),
        (markdown) => self.runSync(self.parse(markdown), markdown) as Root,
      );
      // After the hoist and tail passes, so a mis-paired region is a top-level
      // comment node by the time its signature is looked for.
      commentRegionTransform(tree, String(file), (markdown) =>
        self.parse(markdown),
      );
      visit(tree, "comment", (node: any) => {
        node.data = {
          ...node.data,
          hName: COMMENT_ELEMENT,
          hChildren: [],
        };
      });
    }
    lrdFootnoteTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    // After the footnote recovery above, so a `[^x]:` label is already out of
    // the way and only real link reference definitions are re-decided.
    legacyDefinitionTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    legacyDefinitionPromoteTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    shortCommentTransform(tree);
    if (opts.customTaskChars) {
      customTaskCharTransform(tree, String(file));
    }
    if (opts.math) {
      mathDisplayTransform(tree, String(file));
    }
    if (opts.callouts) {
      calloutTransform(tree);
    }
    quoteIndentedCodeTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    containerLazyTransform(tree, String(file));
    quoteMergeTransform(tree, String(file));
    definitionTabTransform(tree, String(file));
    // Before the bare-reference pass: a `[^1]` the fence swallows is code, and
    // code is literal, so it must stop looking like a reference first.
    fenceOutlivesTransform(tree, String(file));
    mathOutlivesTransform(tree, String(file));
    listUnderDefinitionTransform(tree, String(file));
    tableRowStyleTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    tableShortDelimiterTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    // Before the interrupt fold: demoting the heading is what lets a definition
    // on the next line continue it as prose.
    setextUnderlineTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    footnoteLabelTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    multilineSetextTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    tableInterruptTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    if (opts.bareFootnoteRefs) {
      // Must precede the bare-reference pass: it re-inserts a `[^n]:` label that
      // the bare pass then reduces, as Obsidian shows it.
      // Order matters: a definition that is really lazy continuation must be
      // merged away first, or the table split fires on a definition that is
      // about to stop being one. A table cannot interrupt a paragraph either.
      footnoteInterruptTransform(tree, String(file));
      footnoteTableSplitTransform(
        tree,
        String(file),
        (markdown) => self.runSync(self.parse(markdown), markdown) as Root,
      );
      // After the interrupt fold, or a definition about to be merged into the
      // paragraph above it would be turned into a heading instead.
      setextDefinitionTransform(tree, String(file));
      bareFootnoteRefTransform(tree, String(file));
      // Last: the folds above can remove the definition a reference was bound to
      // while parsing, leaving it orphaned.
      footnoteOrphanTransform(tree);
    }
    paragraphMergeTransform(tree, String(file));
    if (opts.taskReparse) {
      taskReparseTransform(
        tree,
        String(file),
        (markdown) => self.runSync(self.parse(markdown), markdown) as Root,
      );
    }
  };
}

export { wikilinkSyntax } from "./lib/syntax/wikilink.js";
export { highlightSyntax } from "./lib/syntax/highlight.js";
export { commentSyntax } from "./lib/syntax/comment.js";
export { tagSyntax } from "./lib/syntax/tag.js";
export { inlineFootnoteSyntax } from "./lib/syntax/inline-footnote.js";

export { wikilinkFromMarkdown } from "./lib/mdast/wikilink.js";
export { highlightFromMarkdown } from "./lib/mdast/highlight.js";
export { commentFromMarkdown } from "./lib/mdast/comment.js";
export { tagFromMarkdown } from "./lib/mdast/tag.js";
export { wikilinkToMarkdown } from "./lib/mdast/wikilink-to-markdown.js";
export { highlightToMarkdown } from "./lib/mdast/highlight-to-markdown.js";
export { commentToMarkdown } from "./lib/mdast/comment-to-markdown.js";
export { tagToMarkdown } from "./lib/mdast/tag-to-markdown.js";
export { customTaskCharTransform } from "./lib/task-char.js";
export { mathDisplayTransform } from "./lib/math-display.js";
export { taskReparseTransform } from "./lib/task-reparse.js";
export { bareFootnoteRefTransform } from "./lib/footnote-bare.js";
export { footnoteInterruptTransform } from "./lib/footnote-interrupt.js";
export { containerLazyTransform } from "./lib/container-lazy.js";
export { footnoteTableSplitTransform } from "./lib/footnote-table-split.js";
export { footnoteOrphanTransform } from "./lib/footnote-orphan.js";
export { calloutTransform } from "./lib/callout.js";
export { commentHoistTransform } from "./lib/comment-hoist.js";
export { commentTailTransform } from "./lib/comment-tail.js";
export { taskCharToMarkdown } from "./lib/mdast/task-char-to-markdown.js";

export {
  isWikilink,
  isEmbed,
  collectWikilinks,
  collectEmbedPaths,
} from "./lib/collect.js";

export type {
  Wikilink,
  Highlight,
  Comment,
  Tag,
  InlineFootnote,
  Callout,
  CalloutTitle,
} from "./lib/types.js";
export type { CollectWikilinksOptions } from "./lib/collect.js";
