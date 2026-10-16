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
import { refBeforeLabelTransform } from "./lib/ref-before-label.js";
import { footnoteInterruptTransform } from "./lib/footnote-interrupt.js";
import { inlineFootnoteInertTransform } from "./lib/inline-footnote-inert.js";
import { inlineRefoldTransform } from "./lib/inline-refold.js";
import {
  containerLazyTransform,
  listEmptyItemTransform,
} from "./lib/container-lazy.js";
import { quoteMergeTransform } from "./lib/quote-merge.js";
import { listMergeTransform } from "./lib/list-merge.js";
import { indentTabTransform } from "./lib/indent-tab.js";
import { listEmptyNestTransform } from "./lib/list-empty-nest.js";
import { listItemExtentTransform } from "./lib/list-item-extent.js";
import { listTabTransform } from "./lib/list-tab.js";
import { listTabStraddleTransform } from "./lib/list-tab-straddle.js";
import { quoteTabTransform } from "./lib/quote-tab.js";
import { paragraphMergeTransform } from "./lib/paragraph-merge.js";
import { normalizePointsTransform } from "./lib/normalize-points.js";
import { breakPositionsTransform } from "./lib/break-positions.js";
import { commentParseTransform } from "./lib/comment-parse.js";
import { commentDefinitionColumnTransform } from "./lib/comment-definition-column.js";
import { commentQuoteExtentTransform } from "./lib/comment-quote-extent.js";
import { quoteCommentLazyTransform } from "./lib/quote-comment-lazy.js";
import {
  ensureLineOffsets,
  lineOffsetsFromMarkdown,
} from "./lib/mdast/line-offsets.js";
import { definitionTabTransform } from "./lib/definition-tab.js";
import { definitionTrimTransform } from "./lib/definition-trim.js";
import { fenceOutlivesTransform } from "./lib/fence-outlives.js";
import { itemFenceCloserTransform } from "./lib/item-fence-closer.js";
import { mathOutlivesTransform } from "./lib/math-outlives.js";
import { mathMidlineTransform } from "./lib/math-midline.js";
import { listUnderDefinitionTransform } from "./lib/list-under-definition.js";
import { tableRowStyleTransform } from "./lib/table-row-style.js";
import { tablePipeStyleTransform } from "./lib/table-pipe-style.js";
import { calloutTitleInterruptTransform } from "./lib/callout-title-interrupt.js";
import { tableLabelRowTransform } from "./lib/table-label-row.js";
import { tableIndentedRowTransform } from "./lib/table-indented-row.js";
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
import { itemHtmlExtentTransform } from "./lib/item-html-extent.js";
import { shortCommentTransform } from "./lib/short-comment.js";
import { definitionBlankTailTransform } from "./lib/definition-blank-tail.js";
import { definitionBlankTitleTransform } from "./lib/definition-blank-title.js";
import { frontmatterTailTransform } from "./lib/frontmatter-tail.js";
import { blankLabelReferenceTransform } from "./lib/blank-label-reference.js";
import { textareaNotRawTransform } from "./lib/textarea-not-raw.js";
import { closingPreInterruptSyntax } from "./lib/syntax/closing-pre-interrupt.js";
import { labelOpenerWikilinkTransform } from "./lib/label-opener-wikilink.js";
import { autolinkLiteralExtentTransform } from "./lib/autolink-literal-extent.js";
import { definitionColumnTransform } from "./lib/definition-column.js";
import { definitionEndBeforeLabelTransform } from "./lib/definition-end-before-label.js";
import { definitionDeindentCodeTransform } from "./lib/definition-deindent-code.js";
import { definitionSetextTransform } from "./lib/definition-setext.js";
import { listDeepContinuationTransform } from "./lib/list-deep-continuation.js";
import { invisibleBlankLineTransform } from "./lib/invisible-blank-line.js";
import { angleDestinationEscapeTransform } from "./lib/angle-destination-escape.js";
import { doubledFootnoteOpenerTransform } from "./lib/doubled-footnote-opener.js";
import { restoreInlinePositionsTransform } from "./lib/restore-inline-positions.js";
import { tagAfterCloserTransform } from "./lib/tag-after-closer.js";
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
import { itemDotThresholdTransform } from "./lib/item-dot-threshold.js";
import { footnoteTableSplitTransform } from "./lib/footnote-table-split.js";
import { calloutTransform } from "./lib/callout.js";
import { definitionIndentedCodeTransform } from "./lib/definition-indented-code.js";
import { definitionLazySplitTransform } from "./lib/definition-lazy-split.js";
import { mathListExtentTransform } from "./lib/math-list-extent.js";
import { definitionMathAbsorbTransform } from "./lib/definition-math-absorb.js";
import { commentHoistTransform } from "./lib/comment-hoist.js";
import { commentTailTransform } from "./lib/comment-tail.js";
import { commentDefinitionExtentTransform } from "./lib/comment-definition-extent.js";
import { commentInDefinitionTransform } from "./lib/comment-in-definition.js";
import { commentRegionTransform } from "./lib/comment-region.js";
import {
  definitionContinuationTransform,
  definitionLazyTransform,
  definitionWindowTransform,
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
  /** Defaults to `legacy`. See {@link RemarkObsidianPreset}. */
  preset?: RemarkObsidianPreset;
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

/**
 * Which body of behaviour to follow where Obsidian and CommonMark disagree.
 *
 * `legacy` reproduces Obsidian, which is what an Obsidian plugin or a Quartz site
 * rendering a vault needs: the whole point is that the output matches what the
 * author saw in the app. It is the default, and it is every option at the value the
 * parity corpus is measured against.
 *
 * `strict` keeps Obsidian's *syntax* -- wikilinks, embeds, callouts, tags, `%%`
 * comments, `==highlights==`, `$math$`, frontmatter -- while parsing everything
 * CommonMark and GFM already define the way they define it. That is what a consumer
 * outside Obsidian usually wants: Obsidian's extensions are the reason to use this
 * package, but its emphasis, list, entity, autolink, code-span, html-block and
 * link-label divergences are bugs it inherited from `remark-parse@8` and has not
 * fixed, and reproducing them off-platform helps nobody.
 *
 * The split is taken from the options' own documentation rather than from taste:
 * every flag below is one whose docstring says it parses something "as Obsidian
 * does" or "instead of CommonMark's", so turning it off is by definition the
 * compliant reading. An explicit option always wins over the preset.
 */
export type RemarkObsidianPreset = "legacy" | "strict";

/** Every behaviour flag, with the preset selector itself excluded. */
export type RemarkObsidianFlags = Required<
  Omit<RemarkObsidianOptions, "preset">
>;

const STRICT_OVERRIDES: Partial<RemarkObsidianFlags> = {
  legacyEmphasis: false,
  legacyStrikethrough: false,
  legacyEntities: false,
  legacyAutolinks: false,
  legacyCodeSpans: false,
  legacyLists: false,
  legacyHtmlBlocks: false,
  labelPrecedence: false,
  // Obsidian's reading view re-parses a task line, so `- [ ] 1.` nests where
  // CommonMark leaves two flat items.
  taskReparse: false,
  // GFM leaves an undefined `[^x]` literal; stripping its delimiters is Obsidian
  // rendering, not parsing.
  bareFootnoteRefs: false,
  // A soft line ending is not a break in CommonMark.
  positionedBreaks: false,
  // GFM admits only `[ ]` and `[x]`.
  customTaskChars: false,
};

const PRESETS: Record<RemarkObsidianPreset, Partial<RemarkObsidianFlags>> = {
  legacy: {},
  strict: STRICT_OVERRIDES,
};

const defaultOptions: RemarkObsidianFlags = {
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
  const opts = {
    ...defaultOptions,
    ...PRESETS[userOpts?.preset ?? "legacy"],
    ...userOpts,
  };
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
      commentHoistTransform(tree, String(file));
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
      commentInDefinitionTransform(tree, String(file), (markdown) =>
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
    // Beside the quote one, which carries the same rule for a quote, callout or list-item
    // host. This one's host is a LINK reference definition, and the scoping that matters is
    // what it excludes: a `footnoteDefinition`'s indented line is its own content, which 42
    // corpus cases depend on.
    definitionIndentedCodeTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    quoteIndentedCodeTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    // Beside the pass above, which handles the same shape when the marker sits on the code's
    // own line. A single-digit `1.` marker moves the item's CODE THRESHOLD out by one, the
    // same adjustment `definition-column.ts` already applies to the column.
    itemDotThresholdTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    // Before the absorption, which is what keeps it small: the unclosed `$$` is still a root
    // SIBLING of the list here, so bounding it lets the existing pass absorb a correctly
    // ended node. After absorption it would mean splitting a node inside a `listItem`.
    mathListExtentTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    // Beside the pass above and for the same reason: the continuation line is still INSIDE
    // the definition here, where no guard in the absorption can see it. Splitting first lets
    // that chain decide the tail by its own node type, which it already does correctly for
    // all 80 cells of the absorption matrix -- a list takes indented code, a quote does not,
    // a comment is taken by nothing.
    definitionLazySplitTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    containerLazyTransform(tree, String(file));
    // Directly after the absorb above, which is what makes the lazy paragraph a SIBLING of
    // the item's html in the first place. Placed with the other html passes it was INERT:
    // the pair does not exist yet there, and it is not gated on `math` either, which an
    // earlier placement inside that branch silently was.
    itemHtmlExtentTransform(tree, String(file));
    // The complement of the pass above: that one needs no blank line, this one
    // needs exactly the blank line it rejects.
    listEmptyItemTransform(tree, String(file), (markdown) => reparse(markdown));
    // After it, because that pass has already put any trailing block in the sibling
    // item and this only has to move the item. Legacy reading only.
    if (opts.legacyLists) listEmptyNestTransform(tree, String(file));
    quoteMergeTransform(tree, String(file));
    // Beside the quote merge and for the same reason, but it must follow
    // `containerLazyTransform`: that pass absorbs a column-zero definition into the list
    // above it, and the adjacency this repairs only exists afterwards. Their B10 -- a label
    // between two items is the first item's lazy text, so the list never ended.
    listMergeTransform(tree, String(file));
    // After the quote passes have settled the block, since this reads its lines.
    quoteTabTransform(tree, String(file));
    listTabTransform(tree, String(file));
    // Beside the tab rule above, and like it only under the legacy list reading.
    if (opts.legacyLists) listTabStraddleTransform(tree, String(file));
    // After the quote passes have settled the block, since this reads the
    // quote's own extent, and before the footnote passes that would bind a
    // definition it swallows.
    if (opts.comments) commentQuoteExtentTransform(tree, String(file));
    // Beside the pass above, which cannot reach a comment that is the quote's LAST child --
    // which is exactly what a depth-2 opener produces, because the lazy line stays at root.
    if (opts.comments) quoteCommentLazyTransform(tree, String(file));
    // Before the footnote passes, so a definition this recovers is one they see.
    indentTabTransform(tree, String(file), (markdown) => reparse(markdown));
    // Unconditional, unlike the continuation pass above it: a definition whose
    // first line opened nothing to continue leaves its next line behind whether
    // comments are on or not.
    definitionLazyTransform(tree, String(file));
    // After the lazy absorb, so the window sees the definition at its full extent.
    definitionWindowTransform(tree, String(file));
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
    // Placed after the three table passes so the table it folds a label row into has
    // settled its shape, and `pass-order.mts` reports that claim as UNEXERCISED: running
    // this pass first is byte-identical over the whole corpus. micromark builds the table
    // before any transform runs, so the node it needs always exists; the ordering only
    // matters for a table whose shape one of those passes changes in a way that moves the
    // label row, which no recorded case does. Kept here because it is the safe position and
    // the claim is now honest about its evidence.
    tableLabelRowTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    // After every table pass, so the table is in its final shape before an indented body row
    // is taken off it. Their rules document's C2: a row indented by even one space does not
    // start with a pipe, so it is not a row and the table ends before it.
    tableIndentedRowTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    // After the callout passes, and this one IS exercised -- `pass-order.mts` reports a
    // different tree when it runs first. It reads `calloutTitle`, which does not exist
    // until `calloutTransform` has built it, so at the top it finds nothing and the
    // ordered item below a title stays a paragraph.
    calloutTitleInterruptTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    // Before the interrupt fold: demoting the heading is what lets a definition
    // on the next line continue it as prose.
    // Before the demoting pass, which only looks at headings that already
    // exist: inside a container there is none yet.
    // Before the setext passes: a break cancelled by a tab is a list from here on,
    // and nothing downstream should still see a `thematicBreak` there.
    // Before the lazy passes: a line of invisible whitespace closed the block above
    // it, so nothing may absorb it afterwards.
    invisibleBlankLineTransform(tree, String(file));
    // Before the lazy passes: a deeply indented continuation belongs to the item,
    // so the block structure has to settle before anything absorbs siblings.
    listDeepContinuationTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    // Before anything reads definitions: a definition directly under a setext
    // underline is not a definition at all, it is the heading's own line.
    definitionSetextTransform(tree, String(file));
    // Before everything that reads offsets: gfm's autolink literal splices nodes
    // with no position at all, and a pass without offsets correctly stands aside.
    restoreInlinePositionsTransform(tree, String(file));
    // Before the bracket passes: a `[^` that beat an inline footnote is a reference,
    // and the passes below ask the tree which construct owns each bracket.
    doubledFootnoteOpenerTransform(tree, String(file));
    // Before the bracket passes: a link the tokenizer never built is still a link,
    // and the passes below ask the tree which construct owns each bracket.
    angleDestinationEscapeTransform(tree, String(file));
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
      // Before it, because it undoes the node that hides the text that pass scans: a
      // `[^1][^2]` arrives as ONE `linkReference` swallowing both pairs, so there is no plain
      // text left for the bare-reference pass to find.
      refBeforeLabelTransform(tree, String(file));
      bareFootnoteRefTransform(tree, String(file));
      // Before the column pass, because it decides whether there is a definition to give a
      // column to at all: B3's minimum moves the indented-code threshold with the content
      // column, so a label four past the lowered floor is code and Obsidian reports none.
      // Before the threshold pass and the column pass: it changes which lines the definition
      // owns, and both of those read the definition's own extent.
      definitionMathAbsorbTransform(tree, String(file));
      definitionDeindentCodeTransform(tree, String(file), (markdown) =>
        self.parse(markdown),
      );
      // Last of the footnote passes, so it sees every definition in its final place.
      definitionColumnTransform(tree, String(file));
      // After the column pass, which reads a definition's own extent. This only pulls an END
      // back, so running it earlier would hand every later pass a shorter definition than the
      // one it was measured against.
      definitionEndBeforeLabelTransform(tree, String(file));
      // After the reference passes, because the tree is what can say whether the `]`
      // before a tag closed a construct or was ordinary text.
      tagAfterCloserTransform(tree);
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
      // Directly after, because that pass is where the defect comes from: it re-parses the
      // body through this chain, `definitionColumnTransform` clamps a whitespace-prefixed
      // definition to a block the FRAGMENT does not contain, and the node lands at its line
      // start. Obsidian indexes the label at its bracket.
      commentDefinitionColumnTransform(tree, String(file));
    }
    // LATE, and the position is the whole of why it works. Early in the chain an item whose
    // fence was broken by a column-zero line still holds that line as its own child -- a
    // `blockquote`, say -- so the item's last child is not the fence's `code` and the pass
    // declines. By here the absorption passes have folded those away and the shape is the one
    // the probes describe: the item ending in a `code`, and a root `code` whose first line is
    // the matching closer.
    // `reparse`, not `self.parse`: the remainder holds bare references like `use[^1]`, and a
    // plain parse leaves those as literal text -- GFM only builds a `footnoteReference` for a
    // name that is defined, and `bareFootnoteRefTransform` is what converts the rest.
    itemFenceCloserTransform(tree, String(file), (markdown) =>
      reparse(markdown),
    );
    // After every pass that can extend a definition, and before points are
    // normalised from the offsets this corrects.
    definitionTrimTransform(tree, String(file));
    // Strictly after the trim: that pass pulls a definition back off an interior
    // blank, this one extends it over a trailing blank, and an earlier placement was
    // silently undone by it.
    definitionBlankTailTransform(tree, String(file));
    // After the blank-tail pass, which settles where a definition ends, and before points are
    // normalised from the offsets this moves. Their D6 -- a title may start after a blank
    // line, and the reference inside it is then dead.
    definitionBlankTitleTransform(tree, String(file));
    // After every pass that reads a newline out of a text value, and before points
    // are normalised from the offsets it sets.
    if (opts.positionedBreaks) breakPositionsTransform(tree, String(file));
    // Late, and order-free: it only ever rewrites a `link`'s own `url` and `title`,
    // which nothing else here reads. `pass-order.mts` confirms it -- identical output at
    // both extremes of the chain.
    linkNbspTitleTransform(tree);
    // After every pass that can rewrite a paragraph's span, since it matches on one.
    blankLabelReferenceTransform(tree, String(file));
    // After every pass that can move a list item's end, and before points are rebuilt.
    // The overlap it repairs comes from `remark-math`; its own file carries the controls.
    listItemExtentTransform(tree);
    // Last, so every pass above only has to keep its offsets honest. This comment was
    // orphaned two passes above, where it read as a claim about `linkNbspTitle`; the
    // ordering audit is what surfaced it, since the detector attributes a comment to the
    // call below it and found this pass undocumented.
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
