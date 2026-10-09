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
import { legacyDeleteSyntax } from "./lib/syntax/legacy-delete.js";
import { legacyAutolinkSyntax } from "./lib/syntax/legacy-autolink.js";
import { legacyCodeTextSyntax } from "./lib/syntax/legacy-code-text.js";
import { legacyListSyntax } from "./lib/syntax/legacy-list.js";
import { legacyEntitySyntax } from "./lib/syntax/legacy-entity.js";

import { wikilinkFromMarkdown } from "./lib/mdast/wikilink.js";
import { highlightFromMarkdown } from "./lib/mdast/highlight.js";
import { commentFromMarkdown } from "./lib/mdast/comment.js";
import { tagFromMarkdown } from "./lib/mdast/tag.js";
import { inlineFootnoteFromMarkdown } from "./lib/mdast/inline-footnote.js";
import { wikilinkToMarkdown } from "./lib/mdast/wikilink-to-markdown.js";
import { breakToMarkdown } from "./lib/mdast/break-to-markdown.js";
import { highlightToMarkdown } from "./lib/mdast/highlight-to-markdown.js";
import { calloutToMarkdown } from "./lib/mdast/callout-to-markdown.js";
import { commentToMarkdown } from "./lib/mdast/comment-to-markdown.js";
import { tagToMarkdown } from "./lib/mdast/tag-to-markdown.js";
import { inlineFootnoteToMarkdown } from "./lib/mdast/inline-footnote-to-markdown.js";
import { footnoteReferenceToMarkdown } from "./lib/mdast/footnote-reference-to-markdown.js";
import { customTaskCharTransform } from "./lib/task-char.js";
import { mathDisplayTransform } from "./lib/math-display.js";
import { mathFenceTransform } from "./lib/math-fence.js";
import { taskReparseTransform } from "./lib/task-reparse.js";
import { bareFootnoteRefTransform } from "./lib/footnote-bare.js";
import { footnoteInterruptTransform } from "./lib/footnote-interrupt.js";
import { inlineFootnoteInertTransform } from "./lib/inline-footnote-inert.js";
import { inlineRefoldTransform } from "./lib/inline-refold.js";
import {
  containerLazyTransform,
  listEmptyItemTransform,
} from "./lib/container-lazy.js";
import { quoteMergeTransform } from "./lib/quote-merge.js";
import { indentTabTransform } from "./lib/indent-tab.js";
import { listTabTransform } from "./lib/list-tab.js";
import { quoteTabTransform } from "./lib/quote-tab.js";
import { paragraphMergeTransform } from "./lib/paragraph-merge.js";
import { normalizePointsTransform } from "./lib/normalize-points.js";
import { breakPositionsTransform } from "./lib/break-positions.js";
import { commentParseTransform } from "./lib/comment-parse.js";
import { commentQuoteExtentTransform } from "./lib/comment-quote-extent.js";
import {
  ensureLineOffsets,
  lineOffsetsFromMarkdown,
} from "./lib/mdast/line-offsets.js";
import { definitionTabTransform } from "./lib/definition-tab.js";
import { definitionTrimTransform } from "./lib/definition-trim.js";
import { fenceOutlivesTransform } from "./lib/fence-outlives.js";
import { mathOutlivesTransform } from "./lib/math-outlives.js";
import { mathMidlineTransform } from "./lib/math-midline.js";
import { listUnderDefinitionTransform } from "./lib/list-under-definition.js";
import { tableRowStyleTransform } from "./lib/table-row-style.js";
import { tablePipeStyleTransform } from "./lib/table-pipe-style.js";
import { tableShortDelimiterTransform } from "./lib/table-short-delimiter.js";
import {
  htmlSetextTransform,
  multilineSetextTransform,
  setextUnderlineTransform,
} from "./lib/setext-underline.js";
import { footnoteLabelTransform } from "./lib/footnote-label.js";
import { tableInterruptTransform } from "./lib/table-interrupt.js";
import { containerSetextTransform } from "./lib/container-setext.js";
import { lazySetextTransform } from "./lib/lazy-setext.js";
import { bareCheckboxTransform } from "./lib/bare-checkbox.js";
import { blankFootnoteLabelTransform } from "./lib/blank-footnote-label.js";
import { mathUnclosedContainerTransform } from "./lib/math-unclosed-container.js";
import { thematicBreakTabTransform } from "./lib/thematic-break-tab.js";
import { labelPrecedenceTransform } from "./lib/label-precedence.js";
import { setextDefinitionTransform } from "./lib/setext-definition.js";
import { shortCommentTransform } from "./lib/short-comment.js";
import { definitionBlankTailTransform } from "./lib/definition-blank-tail.js";
import { frontmatterTailTransform } from "./lib/frontmatter-tail.js";
import { blankLabelReferenceTransform } from "./lib/blank-label-reference.js";
import { textareaNotRawTransform } from "./lib/textarea-not-raw.js";
import { closingPreInterruptSyntax } from "./lib/syntax/closing-pre-interrupt.js";
import { labelOpenerWikilinkTransform } from "./lib/label-opener-wikilink.js";
import { autolinkLiteralExtentTransform } from "./lib/autolink-literal-extent.js";
import { autolinkLiteralToMarkdown } from "./lib/mdast/autolink-literal-to-markdown.js";
import { htmlTailToMarkdown } from "./lib/mdast/html-tail-to-markdown.js";
import { linkNbspTitleTransform } from "./lib/link-nbsp-title.js";
import { linkReferenceToMarkdown } from "./lib/mdast/link-reference-to-markdown.js";
import { frontmatterUnclosedTransform } from "./lib/frontmatter-unclosed.js";
import { lrdFootnoteTransform } from "./lib/lrd-footnote.js";
import {
  legacyDefinitionPromoteTransform,
  legacyDefinitionTransform,
} from "./lib/legacy-definition.js";
import { quoteIndentedCodeTransform } from "./lib/quote-indented-code.js";
import { footnoteTableSplitTransform } from "./lib/footnote-table-split.js";
import { calloutTransform } from "./lib/callout.js";
import { commentHoistTransform } from "./lib/comment-hoist.js";
import { commentTailTransform } from "./lib/comment-tail.js";
import { commentDefinitionExtentTransform } from "./lib/comment-definition-extent.js";
import { commentInDefinitionTransform } from "./lib/comment-in-definition.js";
import { commentRegionTransform } from "./lib/comment-region.js";
import {
  definitionContinuationTransform,
  definitionLazyTransform,
} from "./lib/definition-continuation.js";
import { taskCharToMarkdown } from "./lib/mdast/task-char-to-markdown.js";

import { math as mathSyntax } from "micromark-extension-math";
import { mathTextSyntax } from "./lib/syntax/math-text.js";
import { mathFromMarkdown, mathToMarkdown } from "mdast-util-math";
import { frontmatter as frontmatterSyntax } from "micromark-extension-frontmatter";
import {
  frontmatterFromMarkdown,
  frontmatterToMarkdown,
} from "mdast-util-frontmatter";

/**
 * How deep the transform chain may re-enter itself through `reparse`.
 *
 * Genuine nesting shrinks the fragment each time, so a handful of levels is more
 * than real documents reach; the bound exists only to stop a pass that hands back
 * the text it was given from recursing forever.
 */
const MAX_REPARSE_DEPTH = 8;

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
   * Parse a kept comment's body into `children`, beside the `value` it already
   * carries. Obsidian indexes what a comment contains without rendering it, so
   * a reference written inside one is live to `metadataCache` while nothing in
   * the document shows it; this is what lets a consumer find and place an edit
   * on such a node instead of re-scanning a string.
   *
   * Additive: `value` is untouched and the serialiser still writes from it, so
   * round-tripping is unchanged. Needs `keepComments`, since there is no node
   * to parse into otherwise.
   */
  parseComments?: boolean;

  /**
   * Record `remark-parse@8`'s `offset` table on the root as
   * `data.lineOffsets`: how many characters each line's containers consume,
   * keyed by one-based line number, with a line no container owns absent.
   *
   * It is what converts a column inside a stripped line back into a column in
   * the file, and no node position carries it for a continuation line -- `> b`
   * below `> a` re-states the prefix without starting a node. Obsidian's own
   * parser keeps the same table, so reproducing its reported columns needs it.
   */
  lineOffsets?: boolean;
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
  /**
   * Parse `~~` the way `remark-parse@8.0.3` does, which is what Obsidian ships,
   * instead of GFM's strikethrough. Legacy closes on the first `~~` it reaches and
   * honours no escape at all, so `~~del\~~` is a `delete` holding `del\` where GFM
   * reads `\~` as an escaped tilde and leaves the run literal, and `]]~~~~` renders
   * `]]` because `~~~~` is an empty `delete` rather than four tildes.
   *
   * Needs `remark-gfm` registered *before* this package, which is what the chain
   * does: a combined micromark extension prepends its constructs, so the later
   * extension wins a shared code.
   *
   * On by default, because leaving it off is not neutral -- it silently produces
   * different strikethrough from the app for any such run.
   */
  legacyStrikethrough?: boolean;
  /**
   * Resolve a character reference written without its semicolon, as HTML and
   * Obsidian both do. CommonMark requires the terminator, so `&amp` stays four
   * characters without this while the app renders `&`. Matching is greedy against
   * HTML's legacy table, so `&notreal` is `¬real`, and numeric references resolve
   * bare too.
   *
   * On by default, because leaving it off silently shows markup the app resolves.
   */
  legacyEntities?: boolean;
  /**
   * Let an email autolink hold a backslash, as `remark-parse@8` does.
   * `<foo\+@bar.example.com>` links to `mailto:foo\+@bar.example.com` and shows
   * the backslash; CommonMark reads `\+` as an escaped plus, fails the email
   * pattern, and leaves the brackets as text.
   *
   * On by default, because the failure is worse than a missing link:
   * `<a\b@c.test>` escapes the `b`, drops `<a\` as text, and autolinks the
   * remaining `b@c.test` -- a working link to the wrong address.
   */
  legacyAutolinks?: boolean;
  /**
   * Let an inline-code opener retry with a shorter width, as Obsidian does.
   * `` ``code` `` renders a literal backtick followed by a code span holding
   * `code`, where CommonMark requires a closer of the opener's own width and
   * leaves the whole run literal without one. A short opener never grows, so
   * `` `code`` `` stays literal either way.
   *
   * On by default. It also makes a pathological document *faster*: an opener with
   * no usable closer is settled from a cached run index instead of stock's
   * end-of-context scan, which is the scan that makes cmark's increasing-run
   * shape superlinear.
   */
  legacyCodeSpans?: boolean;
  /**
   * Use Obsidian's list container rather than CommonMark's.
   *
   * Obsidian runs a fork of `remark-parse@8`, whose list parsing is the more
   * permissive of the two, and the legacy stack agrees with Obsidian on every
   * recorded case in this family. Replacing the container is the only route: a
   * container owns its own continuation, so a construct that declines never sees
   * the second item of a list the stock one opened.
   *
   * On by default, and the default moved because the measurement said so. It was
   * shipped off, as `labelPrecedence` was, and turning it on costs **0 regressions**
   * across 3103 cases for 5 gained -- plus two improvements to the independent
   * `metadataCache` oracle, which is the one that has refused two other changes.
   *
   * Two cases in the family remain and are recorded rather than chased: a tab-indented
   * sibling, where `containerState.size` counts characters while `factorySpace` counts
   * columns, and an under-indented continuation, which needs legacy's whole-item
   * minimum-indent scan rather than a different limit.
   */
  legacyLists?: boolean;
  /**
   * Classify html block tags as Obsidian's parser does, not as CommonMark now does.
   *
   * micromark sorts tags into two shared lists and the fork Obsidian runs predates
   * both revisions that matter here, so the classification differs at two points.
   *
   * `pre` is in `htmlRawNames`, which governs only *opening* tags, and is missing
   * from `htmlBlockNames` -- so a bare `</pre>` falls through to a type 7 block,
   * which refuses to interrupt a paragraph. Obsidian carries `pre` in its block-tag
   * list, so there the closer interrupts and takes the rest of its line with it.
   * The rule is narrower than the mechanism suggests and the arbiter pins it: of the
   * four raw names only `</pre>` interrupts, while `</script>`, `</style>` and
   * `</textarea>` stay absorbed. Generalising would cost six cases that match today.
   *
   * `textarea` is the other direction. CommonMark added it to `htmlRawNames` after
   * the fork, so micromark lets `<textarea>` swallow every following block while
   * Obsidian ends it at the first blank line and parses the rest as markdown.
   *
   * On by default. Together the two are worth 1 gained case and `sections` 39 -> 38
   * on the independent `metadataCache` oracle, for 0 regressions. One case in the
   * family stays open for a reason that is not parsing: inside a `<textarea>` the
   * content is the element's *value*, so the recorder finds no `<em>` elements and
   * reads a de-tagged string, which no tree can reproduce without mis-parsing.
   */
  legacyHtmlBlocks?: boolean;
  /**
   * Find a link label by raw balanced-bracket scanning, as Obsidian does, so the
   * outermost pair wins where CommonMark gives the innermost: `[a [b](u) c](v)`
   * links to `v` and shows `[b](u)` as written.
   *
   * On by default, and the default moved because the measurement said so. 369 cases
   * in this corpus hold a nested bracket pair, which is why it shipped behind an
   * option at all -- the actual cost of turning it on is **0 regressions** against
   * 9 cases gained, so the estimate was an upper bound by a wide margin.
   */
  labelPrecedence?: boolean;
  /**
   * Convert a soft line ending into a positioned `break`, so `remark-breaks` has
   * nothing left to do.
   *
   * That package is four lines which throw positions away: `newlineToBreak` is
   * `findAndReplace(tree, [/\r?\n|\r/g, replace])`, `replace` returns a bare
   * `{type: "break"}`, and `findAndReplace` rebuilds the surrounding text without
   * positions either. Doing the same conversion first leaves its regular expression
   * nothing to match, so the tree is identical and every node keeps its place.
   *
   * On by default, because this package is built for a chain that includes
   * `remark-breaks` and is ordered before it. Turn it off for a chain that has no
   * `remark-breaks`, where a soft line ending is not a `break` at all.
   */
  positionedBreaks?: boolean;
  /**
   * Write a line break as a trailing backslash rather than a newline.
   *
   * Off by default, because this package is built for a chain that includes
   * `remark-breaks`, where every soft line ending becomes a `break` and a
   * newline writes it back unchanged. Turn it on when your chain has no
   * `remark-breaks` and a `break` really is a hard break.
   */
  escapedLineBreaks?: boolean;
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
  parseComments: true,
  lineOffsets: true,
  bareFootnoteRefs: true,
  inlineFootnotes: true,
  callouts: true,
  legacyEmphasis: true,
  legacyStrikethrough: true,
  legacyEntities: true,
  legacyAutolinks: true,
  legacyCodeSpans: true,
  legacyLists: true,
  legacyHtmlBlocks: true,
  labelPrecedence: true,
  positionedBreaks: true,
  escapedLineBreaks: false,
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
  // No option: a shortcut reference written back as its own label is correct for every
  // consumer, and the upstream branch it replaces can duplicate the label.
  data.toMarkdownExtensions.push(linkReferenceToMarkdown());
  data.toMarkdownExtensions.push(autolinkLiteralToMarkdown());
  data.toMarkdownExtensions.push(htmlTailToMarkdown());

  if (opts.lineOffsets) {
    data.fromMarkdownExtensions.push(lineOffsetsFromMarkdown());
  }
  if (opts.frontmatter) {
    data.micromarkExtensions.push(frontmatterSyntax(["yaml"]));
    data.fromMarkdownExtensions.push(frontmatterFromMarkdown(["yaml"]));
    data.toMarkdownExtensions.push(frontmatterToMarkdown(["yaml"]));
  }
  if (opts.inlineFootnotes) {
    data.micromarkExtensions.push(inlineFootnoteSyntax());
    data.fromMarkdownExtensions.push(inlineFootnoteFromMarkdown());
    data.toMarkdownExtensions.push(inlineFootnoteToMarkdown());
    // Paired with `bracketLabelReferences`, which reads a label to the first `]`:
    // the default handler escapes a `[` in one, and re-parsing that escape yields a
    // different label every pass.
    data.toMarkdownExtensions.push(footnoteReferenceToMarkdown());
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
  // Callouts are a transform, not a syntax extension, so this is the only
  // half there is -- without it any tree holding one cannot be serialised.
  if (opts.callouts) {
    data.toMarkdownExtensions.push(calloutToMarkdown());
  }
  if (opts.highlights) {
    data.micromarkExtensions.push(highlightSyntax());
    data.fromMarkdownExtensions.push(highlightFromMarkdown());
    data.toMarkdownExtensions.push(highlightToMarkdown());
  }
  // A line break is written as a newline, not a trailing backslash; see the
  // handler for what the backslash costs.
  data.toMarkdownExtensions.push(breakToMarkdown(opts.escapedLineBreaks));
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

  if (opts.legacyStrikethrough) {
    data.micromarkExtensions.push(legacyDeleteSyntax());
  }

  if (opts.legacyEntities) {
    data.micromarkExtensions.push(legacyEntitySyntax());
  }

  if (opts.legacyAutolinks) {
    data.micromarkExtensions.push(legacyAutolinkSyntax());
  }

  if (opts.legacyLists) {
    data.micromarkExtensions.push(legacyListSyntax());
  }
  if (opts.legacyCodeSpans) {
    data.micromarkExtensions.push(legacyCodeTextSyntax());
  }

  if (opts.legacyHtmlBlocks) {
    data.micromarkExtensions.push(closingPreInterruptSyntax());
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

  const transform = (tree: Root, file: unknown): void => {
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
      commentTailTransform(tree, String(file), reparse);
      // After the hoist and tail passes, so a mis-paired region is a top-level
      // comment node by the time its signature is looked for.
      commentRegionTransform(tree, String(file), (markdown) =>
        self.parse(markdown),
      );
      // After the region pass: a definition split off a `%%` closer was never
      // seen by the footnote parser, so its indented continuation is still a
      // sibling at this point.
      definitionContinuationTransform(tree, String(file), (markdown) =>
        self.parse(markdown),
      );
      // After the continuation pass, so a definition that already grew is the
      // one a stray `%%` gets folded back into.
      // Before the pass that turns such a comment back into prose, which is
      // what would otherwise leave nothing here to clamp.
      commentDefinitionExtentTransform(tree, String(file), (markdown) =>
        reparse(markdown),
      );
      commentInDefinitionTransform(tree, String(file));
      visit(tree, "comment", (node: any) => {
        node.data = {
          ...node.data,
          hName: COMMENT_ELEMENT,
          hChildren: [],
        };
      });
    }
    // First, because it rewrites the whole document: a closing fence with a
    // tail means there is no frontmatter in the tree yet at all.
    if (opts.frontmatter) {
      frontmatterTailTransform(tree, String(file), (markdown) =>
        self.parse(markdown),
      );
      // The other half of the same extension defect: a fence that never closes,
      // where a tail is a fence that closes awkwardly. Mutually exclusive with the
      // pass above, which is why either order works.
      frontmatterUnclosedTransform(tree, String(file), (markdown) =>
        self.parse(markdown),
      );
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
    // Before anything reads the block structure: a swallowed `<textarea>` hides whole
    // blocks, so splitting it has to happen while the tree is still being shaped.
    if (opts.legacyHtmlBlocks) {
      textareaNotRawTransform(tree, String(file), (markdown) =>
        self.parse(markdown),
      );
    }
    if (opts.customTaskChars) {
      customTaskCharTransform(tree, String(file));
    }
    if (opts.math) {
      // Before the display pass, which only annotates: this decides what the
      // formula is.
      mathFenceTransform(tree, String(file));
      mathDisplayTransform(tree, String(file));
    }
    if (opts.callouts) {
      calloutTransform(tree, String(file), (markdown) => self.parse(markdown));
    }
    quoteIndentedCodeTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    containerLazyTransform(tree, String(file));
    // The complement of the pass above: that one needs no blank line, this one
    // needs exactly the blank line it rejects.
    listEmptyItemTransform(tree, String(file), (markdown) => reparse(markdown));
    quoteMergeTransform(tree, String(file));
    // After the quote passes have settled the block, since this reads its lines.
    quoteTabTransform(tree, String(file));
    listTabTransform(tree, String(file));
    // After the quote passes have settled the block, since this reads the
    // quote's own extent, and before the footnote passes that would bind a
    // definition it swallows.
    if (opts.comments) commentQuoteExtentTransform(tree, String(file));
    // Before the footnote passes, so a definition this recovers is one they see.
    indentTabTransform(tree, String(file), (markdown) => reparse(markdown));
    // Unconditional, unlike the continuation pass above it: a definition whose
    // first line opened nothing to continue leaves its next line behind whether
    // comments are on or not.
    definitionLazyTransform(tree, String(file));
    definitionTabTransform(tree, String(file));
    // Before the bare-reference pass: a `[^1]` the fence swallows is code, and
    // code is literal, so it must stop looking like a reference first.
    fenceOutlivesTransform(tree, String(file));
    mathOutlivesTransform(tree, String(file));
    mathMidlineTransform(tree, String(file));
    listUnderDefinitionTransform(tree, String(file));
    tableRowStyleTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    // Before the short-delimiter pass: a table whose rows disagree on the
    // leading pipe is not a table at all, so there is nothing to widen.
    tablePipeStyleTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    tableShortDelimiterTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    // Before the interrupt fold: demoting the heading is what lets a definition
    // on the next line continue it as prose.
    // Before the demoting pass, which only looks at headings that already
    // exist: inside a container there is none yet.
    // Before the setext passes: a break cancelled by a tab is a list from here on,
    // and nothing downstream should still see a `thematicBreak` there.
    // Before the bracket passes: a bare URL swallowing a `](` means the brackets
    // after it never belonged to a label at all.
    autolinkLiteralExtentTransform(tree, String(file));
    if (opts.labelPrecedence) {
      // Before label precedence: that pass asks the tree which construct owns a
      // bracket, so the wikilink has to be demoted first or it still owns it.
      labelOpenerWikilinkTransform(tree, String(file), (markdown) =>
        self.parse(markdown),
      );
      labelPrecedenceTransform(tree, String(file), (markdown) =>
        reparse(markdown),
      );
    }
    thematicBreakTabTransform(tree, String(file));
    // Before `containerSetextTransform`: that pass rebuilds a two-line container
    // paragraph in place, and the lazy line has to leave first or it folds into a
    // heading inside the quote instead of one at root.
    // Before both setext passes: a bare checkbox has to stop being a task marker
    // first, or the underline folds a heading whose content excludes the `[ ]`
    // Obsidian still shows.
    blankFootnoteLabelTransform(tree, String(file));
    bareCheckboxTransform(tree, String(file));
    lazySetextTransform(tree, String(file), (markdown) => self.parse(markdown));
    containerSetextTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    setextUnderlineTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    // After the paragraph-based setext passes: this one claims an underline the
    // html block swallowed, which those never see.
    htmlSetextTransform(tree, String(file));
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
      footnoteTableSplitTransform(tree, String(file), reparse);
      // After the interrupt fold, or a definition about to be merged into the
      // paragraph above it would be turned into a heading instead.
      setextDefinitionTransform(tree, String(file));
      // Before the bare-reference pass, so a label this re-tokenizes is still
      // literal text and gets converted with every other one.
      // A plain parse, not the whole pipeline: the transforms splice nodes
      // without positions, and the positions are what let the real characters
      // be read back over the flattened copy.
      inlineRefoldTransform(tree, String(file), (markdown) =>
        self.parse(markdown),
      );
      // Again, because the refold can produce a math node that the first run never
      // saw: `_$$y^2` / `y^2$$_` only becomes one span once the paragraph is
      // re-tokenized here, hundreds of lines after the classification pass. Safe to
      // repeat -- it keys on the real source at the node's span and only ever sets
      // fields, so re-running it on an already-classified tree changes nothing.
      mathDisplayTransform(tree, String(file));
      bareFootnoteRefTransform(tree, String(file));
      // After the bare pass, so a reference it revives inside an inline note is
      // demoted too.
      if (opts.inlineFootnotes) {
        inlineFootnoteInertTransform(tree);
      }
    }
    paragraphMergeTransform(tree, String(file));
    if (opts.taskReparse) {
      taskReparseTransform(tree, String(file), reparse);
      // After the task reparse, not before it. Three passes can open the block this
      // undoes -- micromark itself, `mathMidlineTransform`, and this reparse, which
      // re-reads a task body as block markdown and makes `- [ ] $$y^` math all over
      // again. Running earlier demoted it and was silently reverted.
      mathUnclosedContainerTransform(tree, String(file));
    }
    // Presence of the table means it was recorded, so it is started even for a
    // document holding no container at all.
    if (opts.lineOffsets) ensureLineOffsets(tree);
    // After every pass that can move, split or replace a comment node, so the
    // body is parsed from the span the comment finally claims.
    if (opts.keepComments && opts.parseComments) {
      commentParseTransform(tree, String(file), reparse);
    }
    // After every pass that can extend a definition, and before points are
    // normalised from the offsets this corrects.
    definitionTrimTransform(tree, String(file));
    // Strictly after the trim: that pass pulls a definition back off an interior
    // blank, this one extends it over a trailing blank, and an earlier placement was
    // silently undone by it.
    definitionBlankTailTransform(tree, String(file));
    // After every pass that reads a newline out of a text value, and before points
    // are normalised from the offsets it sets.
    if (opts.positionedBreaks) breakPositionsTransform(tree, String(file));
    // Last, so every pass above only has to keep its offsets honest.
    // Late, and order-free: it only ever rewrites a `link`'s own `url` and `title`,
    // which nothing else here reads.
    linkNbspTitleTransform(tree);
    // After every pass that can rewrite a paragraph's span, since it matches on one.
    blankLabelReferenceTransform(tree, String(file));
    normalizePointsTransform(tree, String(file));
  };

  /**
   * Re-parse a fragment through this plugin's own passes.
   *
   * Never through `self.runSync`. `self` is the whole processor, and the
   * moment it holds an asynchronous plugin -- `rehype-obsidian` is one in the
   * Quartz chain -- `runSync` refuses with "finished async", so a task list
   * or a `%%` comment with a tail threw outright. The harness never saw it
   * because it builds a markdown-only processor where every plugin is sync.
   *
   * Recursing into `transform` runs the same passes on the fragment while
   * staying synchronous.
   *
   * Fragments do *not* only ever shrink, which this used to claim. A pass that
   * locates a body by matching a marker hands back the text it was given when the
   * match fails -- `taskReparseTransform` does exactly that for a nested item whose
   * paragraph already starts past its own marker -- and the chain then re-enters
   * itself on identical input. 55 of 4000 generated documents overflowed the stack
   * that way, 37 frames deep, and a crash is worse than any divergence.
   *
   * So the depth is bounded rather than assumed. At the bound the fragment is still
   * parsed, just not transformed, which keeps it well-formed while cutting the
   * cycle. Bounding it here covers all 19 passes that take a reparse callback
   * instead of each of them guarding separately.
   */
  let depth = 0;
  const reparse = (markdown: string): Root => {
    const fragment = self.parse(markdown);
    if (depth >= MAX_REPARSE_DEPTH) return fragment;
    depth++;
    try {
      transform(fragment, markdown);
    } finally {
      depth--;
    }
    return fragment;
  };

  return transform;
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
