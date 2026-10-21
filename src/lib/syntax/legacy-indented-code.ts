import { factorySpaceMinMax } from "micromark-factory-space";
import { markdownLineEnding } from "micromark-util-character";
import { codes, constants, types } from "micromark-util-symbol";
import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";

/**
 * One raw tab is a whole indent, wherever it lands.
 *
 * `remark-parse@8` reads a leading tab as four columns outright. micromark expands it to the next
 * TAB STOP instead, so the same tab is worth fewer columns the further into a line it starts --
 * and indented code needs four. Behind a quote marker the shortfall is exactly one column:
 *
 *     ">⇥Text" preprocesses to  ">", horizontalTab(-2), virtualSpace(-1), virtualSpace(-1)
 *
 * because the tab opens at column 2 and the next stop is 4, yielding THREE indentation codes.
 * `codeIndented` asks `factorySpaceMinMax` for exactly `tabSize` and `tabSize`, counting CODES
 * rather than columns, so three never satisfies four and the line falls through to a paragraph.
 * That one-code gap is the whole divergence, and it is why leaving the tab unspent in the quote's
 * opener was inert alone -- it raised the run from two codes to three.
 *
 * Measured against live Obsidian 1.15.0 through a detached `MarkdownRenderer.render()`, reporting
 * every `pre > code` with its ancestor path:
 *
 *     > Text          (space)      (no code block)        paragraph, agreed already
 *     >⇥Text          (one tab)    blockquote>pre "Text"  WE SAID PARAGRAPH
 *     >⇥⇥Text         (two tabs)   blockquote>pre "⇥Text" second tab kept VERBATIM
 *     >⟨4sp⟩Text      (4 spaces)   (no code block)        padding + 3, agreed already
 *     >⟨5sp⟩Text      (5 spaces)   blockquote>pre "Text"  padding + 4, agreed already
 *     >⇥<!--          (tab)        blockquote>pre "<!--"  code, NOT an HTML block
 *
 * The two-tab row fixes the shape of the rule: only the FIRST tab is indentation, and the second
 * survives into the content verbatim. CommonMark expands both to their stops and leaves two
 * spaces instead, so this is legacy-gated -- the space rows are plain CommonMark and were already
 * right.
 *
 * Consuming the tab together with the virtual spaces it generated, rather than a column count, is
 * what makes one tab mean one indent at any offset, and bounding the run at those virtual spaces
 * is what leaves a second tab to start `codeFlowValue`.
 *
 * THE PAYOFF IS LAZY CONTINUATION, not the code block. A paragraph takes the following unquoted
 * line and code does not: stock indented-code continuation refuses any line the document
 * tokenizer marked lazy, so the quote closes after the code and a column-0 `[^3]: body` below it
 * defines itself. Before this, that label was absorbed into the quote's paragraph and lost, with
 * no definition in the tree and no node left for a transform to rescue.
 *
 * Useless without `legacyFootnoteDefinitionSyntax`. A tab line following a definition inside a
 * quote must CONTINUE that definition, and the definition is a container whose continuation runs
 * before flow -- so without the matching rule there, the definition closes first and this
 * construct claims its continuation line as code. Measured: 28 documents gained, 32 lost.
 */
const legacyCodeIndented: Construct = {
  name: "legacyCodeIndented",
  tokenize: tokenizeLegacyCodeIndented,
};

const furtherStart: Construct = {
  partial: true,
  tokenize: tokenizeFurtherStart,
};

/**
 * Indented code turned off by option, which `legacy-block-quote.ts` also honours.
 *
 * Checked rather than assumed: this construct is named `legacyCodeIndented` so that disabling
 * stock cannot silently disable it, and that independence cuts both ways -- without this test,
 * turning indented code off would leave this construct still answering for it.
 */
function indentedCodeDisabled(self: TokenizeContext): boolean {
  return self.parser.constructs.disable.null?.includes("codeIndented") === true;
}

function tokenizeLegacyCodeIndented(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;
  return start;

  function start(code: Code): State | undefined {
    if (code !== codes.horizontalTab || indentedCodeDisabled(self)) {
      return nok(code);
    }
    effects.enter(types.codeIndented);
    effects.enter(types.linePrefix);
    effects.consume(code);
    return inPrefix;
  }

  function inPrefix(code: Code): State | undefined {
    if (code === codes.virtualSpace) {
      effects.consume(code);
      return inPrefix;
    }
    effects.exit(types.linePrefix);
    return atBreak(code);
  }

  function atBreak(code: Code): State | undefined {
    if (code === codes.eof) return after(code);
    if (markdownLineEnding(code)) {
      return effects.attempt(furtherStart, atBreak, after)(code);
    }
    effects.enter(types.codeFlowValue);
    return inside(code);
  }

  function inside(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) {
      effects.exit(types.codeFlowValue);
      return atBreak(code);
    }
    effects.consume(code);
    return inside;
  }

  function after(code: Code): State | undefined {
    effects.exit(types.codeIndented);
    return ok(code);
  }
}

function tokenizeFurtherStart(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;
  return atFurtherStart;

  function atFurtherStart(code: Code): State | undefined {
    // The lazy test comes FIRST, exactly as stock orders it. A lazy line cannot be code, and
    // that refusal is what closes the container above -- the behaviour this construct exists
    // for, so reordering it would defeat the purpose.
    if (self.parser.lazy[self.now().line]) return nok(code);

    if (markdownLineEnding(code)) {
      effects.enter(types.lineEnding);
      effects.consume(code);
      effects.exit(types.lineEnding);
      return atFurtherStart;
    }

    if (code === codes.horizontalTab) {
      effects.enter(types.linePrefix);
      effects.consume(code);
      return inTabPrefix;
    }

    // A space-indented continuation stays stock's business: four columns exactly.
    return factorySpaceMinMax(
      effects,
      ok,
      onNotEnoughPrefix,
      types.linePrefix,
      constants.tabSize,
      constants.tabSize,
    )(code);
  }

  function inTabPrefix(code: Code): State | undefined {
    if (code === codes.virtualSpace) {
      effects.consume(code);
      return inTabPrefix;
    }
    effects.exit(types.linePrefix);
    return ok(code);
  }

  function onNotEnoughPrefix(code: Code): State | undefined {
    return markdownLineEnding(code) ? atFurtherStart(code) : nok(code);
  }
}

/**
 * Registered on `flowInitial`, where indented code is chosen.
 *
 * Plain `flow` runs only after the generic prefix whitespace has been eaten, so a construct there
 * could never see the tab. Keyed at `horizontalTab` alone, so a space-indented line reaches stock
 * untouched.
 */
export function legacyIndentedCodeSyntax(): Extension {
  return { flowInitial: { [codes.horizontalTab]: legacyCodeIndented } };
}
