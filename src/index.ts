/// <reference types="remark-parse" />
/// <reference types="remark-stringify" />

import type { Options as ToMarkdownOptions } from "mdast-util-to-markdown";
import { parseLegacy8 } from "./rp8/adapt.js";
import type { Root } from "mdast";
import type { Processor } from "unified";
import { visit } from "unist-util-visit";
import { commentHoistTransform } from "./lib/comment-hoist.js";
import { commentDefinitionExtentTransform } from "./lib/comment-definition-extent.js";
import { commentInDefinitionTransform } from "./lib/comment-in-definition.js";
import { definitionLazySplitTransform } from "./lib/definition-lazy-split.js";
import { quoteCommentLazyTransform } from "./lib/quote-comment-lazy.js";
import { itemCommentLazyTransform } from "./lib/item-comment-lazy.js";
import { doubledFootnoteOpenerTransform } from "./lib/doubled-footnote-opener.js";
import { definitionNestedLabelTransform } from "./lib/definition-nested-label.js";
import { definitionMathAbsorbTransform } from "./lib/definition-math-absorb.js";
import { definitionEndBeforeLabelTransform } from "./lib/definition-end-before-label.js";
import { tagAgainstTextTransform } from "./lib/tag-against-text.js";
import { wikilinkAfterLabelTransform } from "./lib/wikilink-after-label.js";
import { footnoteAfterLabelTransform } from "./lib/footnote-after-label.js";
import { inlineFootnoteInertTransform } from "./lib/inline-footnote-inert.js";

import "./lib/types.js";

import { wikilinkSyntax } from "./lib/syntax/wikilink.js";
import { highlightSyntax } from "./lib/syntax/highlight.js";
import { commentSyntax } from "./lib/syntax/comment.js";
import { tagSyntax } from "./lib/syntax/tag.js";
import { inlineFootnoteSyntax } from "./lib/syntax/inline-footnote.js";
import { obsidianFootnoteSyntax } from "./lib/syntax/footnote.js";

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
import { footnoteIdentifierTransform } from "./lib/footnote-identifier.js";
import { tagToMarkdown } from "./lib/mdast/tag-to-markdown.js";
import { inlineFootnoteToMarkdown } from "./lib/mdast/inline-footnote-to-markdown.js";
import {
  footnoteDefinitionToMarkdown,
  footnoteReferenceToMarkdown,
} from "./lib/mdast/footnote-reference-to-markdown.js";
import { customTaskCharTransform } from "./lib/task-char.js";
import { obsidianReadingTransform } from "./lib/obsidian-reading.js";
import { mathDisplayTransform } from "./lib/math-display.js";
import { mathFenceTransform } from "./lib/math-fence.js";
import { bareFootnoteRefTransform } from "./lib/footnote-bare.js";
import { listItemExtentTransform } from "./lib/list-item-extent.js";
import { normalizePointsTransform } from "./lib/normalize-points.js";
import { breakPositionsTransform } from "./lib/break-positions.js";
import { commentParseTransform } from "./lib/comment-parse.js";
import {
  ensureLineOffsets,
  lineOffsetsFromMarkdown,
} from "./lib/mdast/line-offsets.js";
import { mathMidlineTransform } from "./lib/math-midline.js";
import { calloutTitleInterruptTransform } from "./lib/callout-title-interrupt.js";
import { restoreInlinePositionsTransform } from "./lib/restore-inline-positions.js";
import { autolinkLiteralToMarkdown } from "./lib/mdast/autolink-literal-to-markdown.js";
import { htmlTailToMarkdown } from "./lib/mdast/html-tail-to-markdown.js";
import { linkReferenceToMarkdown } from "./lib/mdast/link-reference-to-markdown.js";
import { frontmatterTailTransform } from "./lib/frontmatter-tail.js";
import { frontmatterUnclosedTransform } from "./lib/frontmatter-unclosed.js";
import { frontmatterExactOpenerTransform } from "./lib/frontmatter-exact-opener.js";
import { calloutTransform } from "./lib/callout.js";
import { adjacentIndentedCodeTransform } from "./lib/adjacent-indented-code.js";
import { commentTailTransform } from "./lib/comment-tail.js";
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
  /** Defaults to `legacy`. See {@link RemarkObsidianPreset}. */
  preset?: RemarkObsidianPreset;
  wikilinks?: boolean;
  highlights?: boolean;
  comments?: boolean;
  tags?: boolean;
  /**
   * Read any one character between a task's brackets as a checkbox, completed unless it is a
   * space: `- [-]`, `- [?]` and `- [>]` are tasks, with the character kept as `data.taskChar`.
   * Obsidian documents this ("You can use any character inside the brackets to mark it as
   * complete"), so it is on under both presets; off, only GFM's `[ ]` and `[x]` are boxes.
   */
  customTaskChars?: boolean;
  math?: boolean;
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
 * In short, `strict` is what Obsidian INTENDS -- the CommonMark, GFM and LaTeX it says it
 * supports, plus the syntax it documents adding -- and `legacy` is what it DELIVERS. `legacy`
 * parses with remark-parse 8, the parser Obsidian forks; `strict` parses with micromark, as
 * `remark-parse` does. The feature options below work under both, and an explicit one always
 * wins over the preset's value for it.
 */
export type RemarkObsidianPreset = "legacy" | "strict";

/** Every behaviour flag, with the preset selector itself excluded. */
export type RemarkObsidianFlags = Required<
  Omit<RemarkObsidianOptions, "preset">
>;

/**
 * Where `strict` differs from `legacy` in a feature option: behaviour Obsidian DELIVERS that the
 * standards it claims -- CommonMark, GFM and LaTeX -- do not describe. Obsidian's documented
 * syntax (task boxes with any character, wikilinks, callouts, ...) stays on.
 */
const STRICT_OVERRIDES: Partial<RemarkObsidianFlags> = {
  // GFM leaves an undefined `[^x]` literal; stripping its delimiters is Obsidian
  // rendering, not parsing.
  bareFootnoteRefs: false,
  // A soft line ending is not a break in CommonMark.
  positionedBreaks: false,
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
  frontmatter: true,
  keepComments: true,
  parseComments: true,
  lineOffsets: true,
  bareFootnoteRefs: true,
  inlineFootnotes: true,
  callouts: true,
  positionedBreaks: true,
  escapedLineBreaks: false,
};

/**
 * `mdast-util-math`'s writer, with display inline math kept display.
 *
 * It writes every `inlineMath` with a single-dollar fence, so `$$x$$` came back as `$x$` and
 * stopped being display math -- and under remark-parse 8 a padded `$ \nx\n $` is no math at
 * all, so the formula became text on the first format. A node `mathDisplayTransform` marked
 * display is written with the double-dollar writer instead.
 */
function displayAwareMathToMarkdown(): ToMarkdownOptions {
  const single = mathToMarkdown();
  const double = mathToMarkdown({ singleDollarTextMath: false });
  const inline = single.handlers!.inlineMath!;
  const display = double.handlers!.inlineMath!;
  const inlineMath = ((node, parent, state, info) => {
    const isDisplay =
      (node as { data?: { display?: boolean } }).data?.display === true;
    const fence = isDisplay ? "$$" : "$";
    if (escapedFenceOnly(node.value, fence)) return fence + node.value + fence;
    return (isDisplay ? display : inline)(node, parent, state, info);
  }) as typeof inline;
  (inlineMath as { peek?: unknown }).peek = (inline as { peek?: unknown }).peek;
  return { ...single, handlers: { ...single.handlers, inlineMath } };
}

/**
 * Whether a formula's own `fence` can delimit it again: every run of `$` in it as long as the
 * fence is escaped, and nothing at its edges could join the fence.
 *
 * `mdast-util-math` lengthens the fence past the longest `$` run in the value, escaped or not.
 * But `$$a\$$b$$` parsed as one formula BECAUSE its `\$$` is escaped, and neither preset reads
 * a `$$$` fence -- so the writer's `$$$a\$$b$$$` came back as `$$` + `$a\$$b`, gained five
 * characters on every format and never settled (found by `fuzz/invariant-sweep.ts`). For inline
 * math the same miscount wrote `$a\$ $b$` as display math. Such a value is written back with
 * the fence it was read with.
 */
function escapedFenceOnly(value: string, fence: string): boolean {
  if (!value.includes("$")) return false;
  if (value.startsWith("$") || value.endsWith("$") || value.endsWith("\\")) {
    return false;
  }
  for (
    let at = value.indexOf(fence);
    at !== -1;
    at = value.indexOf(fence, at + 1)
  ) {
    if (value[at - 1] !== "\\") return false;
  }
  return true;
}

/** Whether `remark-gfm` (or `micromark-extension-gfm-footnote`) is among the extensions. */
function hasGfmFootnotes(extensions: ReadonlyArray<unknown>): boolean {
  return extensions.flat().some((extension) => {
    const document = (extension as { document?: Record<number, unknown> })
      .document;
    return [document?.[91]]
      .flat()
      .some(
        (construct) =>
          (construct as { name?: string } | undefined)?.name ===
          "gfmFootnoteDefinition",
      );
  });
}

export default function remarkObsidian(
  userOpts?: RemarkObsidianOptions,
): undefined | ((tree: Root, file: any) => void) {
  const preset = userOpts?.preset ?? "legacy";
  const opts: RemarkObsidianFlags = {
    ...defaultOptions,
    ...PRESETS[preset],
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
  // Obsidian (remark-parse 8) reads `<<https://x>` as one autolink whose address starts with
  // `<`; CommonMark reads a `<` and then the autolink. Escaping a `<` written right before
  // another keeps both readings, so formatting reaches a fixed point under either.
  data.toMarkdownExtensions.push({
    unsafe: [{ character: "<", after: "<", inConstruct: "phrasing" }],
  });

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
    data.toMarkdownExtensions.push(footnoteDefinitionToMarkdown());
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
    data.toMarkdownExtensions.push(displayAwareMathToMarkdown());
  }

  if (opts.customTaskChars) {
    data.toMarkdownExtensions.push(taskCharToMarkdown());
  }

  // `legacy` parses with remark-parse 8, the parser Obsidian forks, rather than correcting
  // micromark towards it. Only the micromark extensions' `toMarkdown` halves above matter then.
  if (preset === "legacy") {
    self.parser = (document: string) => parseLegacy8(document, opts);
    return undefined;
  }

  // Footnotes are in neither CommonMark nor GFM's spec, so `strict` reads them as Obsidian does
  // where that departs from `remark-gfm`: a label's characters here, where a definition starts
  // and ends in `obsidianReadingTransform`. Only when `remark-gfm`'s footnotes are registered --
  // without them there are no footnotes to read, and these tokens would have no handler.
  if (hasGfmFootnotes(data.micromarkExtensions)) {
    data.micromarkExtensions.push(obsidianFootnoteSyntax());
  }

  // Always returned under `strict`. It used to be skipped when `comments`, `customTaskChars`,
  // `math`, `callouts` and `bareFootnoteRefs` were all off, which silently dropped passes that
  // depend on none of them: `positionedBreaks`, `lineOffsets`, the frontmatter repairs and the
  // position passes.
  //
  // `strict` is what Obsidian INTENDS: CommonMark, GFM and LaTeX, plus the syntax Obsidian
  // documents. Each pass below implements that syntax, repairs an extension that falls short of
  // it, keeps positions honest, or carries out an option the caller turned on. What Obsidian's
  // parser merely DELIVERS is `legacy`'s, which parses with that parser instead.
  const transform = (tree: Root, file: unknown): void => {
    const reading = {
      callouts: opts.callouts,
      comments: opts.comments,
      tasks: opts.customTaskChars,
    };
    const read = (markdown: string): Root => {
      const fragment = self.parse(markdown);
      obsidianReadingTransform(
        fragment,
        markdown,
        (text) => self.parse(text),
        reading,
      );
      return fragment;
    };
    // First, because it re-parses the whole document: every pass below sees the result.
    obsidianReadingTransform(
      tree,
      String(file),
      (markdown) => self.parse(markdown),
      reading,
    );
    // The frontmatter extension's three defects. A closing fence with a tail closes it, a fence
    // that never closes is no frontmatter, and neither is a `--- ` opener -- the first because
    // frontmatter is Obsidian's, the other two where CommonMark and Obsidian agree. Each re-parses
    // everything below the fence, so it runs before every other pass and reads that part the
    // way the pass above read the rest.
    if (opts.frontmatter) {
      frontmatterTailTransform(tree, String(file), read);
      // Mutually exclusive with the pass above, which is why either order works.
      frontmatterUnclosedTransform(tree, String(file), read);
      // After the pass above, which can rewrite the document this one inspects.
      frontmatterExactOpenerTransform(tree, String(file), read);
    }
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
      // A comment ends at its closing `%%`, so what follows the closer on that line is
      // visible: the block construct owns the whole closing line, and left alone it hides
      // the tail inside the comment.
      // A multi-line `%%` comment that opens its paragraph is a block of its own, as Obsidian
      // reports it.
      commentHoistTransform(tree, String(file));
      commentTailTransform(tree, String(file), reparse);
      // After the tail pass: a definition split off a `%%` closer was never seen by the
      // footnote parser, so its indented continuation is still a sibling at this point.
      definitionContinuationTransform(tree, String(file), (markdown) =>
        self.parse(markdown),
      );
      // Where a `%%` inside a footnote definition ends, and that a `%%` there cannot open a block
      // comment: Obsidian recognises the definition first. A pair -- the first clamps what the
      // second turns back into prose.
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
    if (opts.customTaskChars) {
      customTaskCharTransform(tree, String(file));
    }
    if (opts.math) {
      // LaTeX's `$$` delimiters, which the math extension reads as a code fence: the text after
      // an opening `$$` is formula rather than an info string, and a `$$` ending a content
      // line closes the block. Before the display pass, which only annotates.
      mathFenceTransform(tree, String(file));
      mathDisplayTransform(tree, String(file));
      // The same delimiters opening display math at the end of a paragraph line.
      mathMidlineTransform(tree, String(file));
    }
    if (opts.callouts) {
      calloutTransform(tree, String(file), (markdown) => self.parse(markdown));
      // After it, since it reads the `calloutTitle` that pass builds: the title is its own
      // line, so the body below it starts fresh and `2.` there opens a list.
      calloutTitleInterruptTransform(tree, String(file), (markdown) =>
        self.parse(markdown),
      );
    }
    // Obsidian's own syntax inside CommonMark's containers, which `strict` follows: a footnote
    // definition's lazy continuation under a container splits off as root blocks, an unclosed
    // `%%` in a quote or list item takes the lines below it, and a paragraph directly under an
    // empty definition is that definition's.
    definitionLazySplitTransform(tree, String(file), (markdown) =>
      self.parse(markdown),
    );
    if (opts.comments) quoteCommentLazyTransform(tree, String(file));
    if (opts.comments) itemCommentLazyTransform(tree, String(file));
    definitionLazyTransform(tree, String(file));
    // Before everything that reads offsets: gfm's autolink literal splices nodes
    // with no position at all, and a pass without offsets correctly stands aside.
    restoreInlinePositionsTransform(tree, String(file));
    // `[^` before an inline footnote's `^[` is a reference opener, and wins.
    doubledFootnoteOpenerTransform(tree, String(file), {
      bareFootnoteRefs: opts.bareFootnoteRefs,
    });
    // A label four columns into a definition, with no blank line, is the definition's text.
    definitionNestedLabelTransform(tree, String(file));
    // A `[[` straight after a bracket pair is no wikilink: `a [x][[w]] b` holds none. Before the
    // reference passes, which find the `[^9]` such a demoted `[[^9]]` still holds.
    if (opts.wikilinks) wikilinkAfterLabelTransform(tree, String(file));
    if (opts.bareFootnoteRefs) {
      bareFootnoteRefTransform(tree, String(file));
    } else {
      // Every definition a pass built from a re-parsed fragment, found the way GFM finds one:
      // micromark resolved references before those definitions existed.
      const defined = new Set<string>();
      visit(tree, "footnoteDefinition", (node) => {
        defined.add(node.identifier.toLowerCase());
      });
      bareFootnoteRefTransform(tree, String(file), { defined });
    }
    // A `[^x]` straight after a bracket pair is no footnote reference: `a [text][^9] b` holds
    // none. After the reference passes above, which would read it back from the text.
    footnoteAfterLabelTransform(tree, String(file));
    // An unclosed `$$` directly under a definition in a list item is the definition's.
    definitionMathAbsorbTransform(tree, String(file));
    // A definition's text ends before a column-0 label or block opener.
    definitionEndBeforeLabelTransform(tree, String(file));
    // A `#` against literal text is no tag: `a*#t`, `&amp;#t` and `x]#t` hold none.
    tagAgainstTextTransform(tree, String(file));
    // Everything inside `^[ … ]` is dead text, references included.
    if (opts.inlineFootnotes) inlineFootnoteInertTransform(tree);
    // Presence of the table means it was recorded, so it is started even for a
    // document holding no container at all.
    if (opts.lineOffsets) ensureLineOffsets(tree);
    // After every pass that can move, split or replace a comment node, so the
    // body is parsed from the span the comment finally claims.
    if (opts.keepComments && opts.parseComments) {
      commentParseTransform(tree, String(file), reparse);
      // Again, because parsing a comment's body revives a reference inside an inline footnote:
      // `a^[x %% [^1] %% y]` -- inertness beats the comment rule, settled live.
      if (opts.inlineFootnotes) inlineFootnoteInertTransform(tree);
    }
    // After every pass that reads a newline out of a text value, and before points
    // are normalised from the offsets it sets.
    if (opts.positionedBreaks) breakPositionsTransform(tree, String(file));
    // After every pass that can move a list item's end, and before points are rebuilt.
    // The overlap it repairs comes from `remark-math`; its own file carries the controls.
    listItemExtentTransform(tree);
    // After every pass that can CREATE a root code node, since it merges adjacent ones and a
    // pass running later could leave a fresh pair unmerged. micromark splits a run of indented
    // lines below a quote-with-heading, and CommonMark makes it one block.
    adjacentIndentedCodeTransform(tree, String(file));
    // Last, so every pass above only has to keep its offsets honest.
    // Last before positions: every pass above, re-parsed fragments included, built identifiers
    // the CommonMark way; Obsidian's are the label lowercased.
    footnoteIdentifierTransform(tree);
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
   * match fails -- the removed `taskReparseTransform` did exactly that for a nested
   * item whose paragraph already started past its own marker -- and the chain then
   * re-enters itself on identical input. 55 of 4000 generated documents overflowed
   * the stack that way, 37 frames deep, and a crash is worse than any divergence.
   *
   * So the depth is bounded rather than assumed. At the bound the fragment is still
   * parsed, just not transformed, which keeps it well-formed while cutting the
   * cycle. Bounding it here covers every pass that takes `reparse` instead of each
   * of them guarding separately.
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
export { bareFootnoteRefTransform } from "./lib/footnote-bare.js";
export { calloutTransform } from "./lib/callout.js";
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
