import { ok as assert } from "devlop";
import { factorySpace } from "micromark-factory-space";
import {
  asciiDigit,
  markdownLineEnding,
  markdownSpace,
} from "micromark-util-character";
import { codes, constants, types } from "micromark-util-symbol";
import { codeToCharacter } from "./legacy-scan.js";
import { isFenceOpen, markQuoteLazyLine } from "./quote-fence-state.js";
import type {
  Code,
  Construct,
  Effects,
  Exiter,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";

/**
 * Succeeds on a line opening with an ORDERED MARKER whose value is not 1.
 *
 * Run through `effects.check`, so its events are discarded and only the yes/no matters -- but
 * the tokens still have to balance, which is why the digits and the marker are entered and
 * exited rather than merely consumed.
 *
 * The value is accumulated as a STRING because `10.` begins with `1`: a first-digit test is what
 * stock uses for the interrupt rule and it cannot tell `1.` from `10.`, which this must.
 */
export const orderedMarkerNotOne: Construct = {
  partial: true,
  tokenize: function tokenizeOrderedMarkerNotOne(
    effects: Effects,
    ok: State,
    nok: State,
  ): State {
    let value = "";
    return start;

    function start(code: Code): State | undefined {
      if (!asciiDigit(code)) return nok(code);
      effects.enter(types.listItemValue);
      return inside(code);
    }

    function inside(code: Code): State | undefined {
      if (asciiDigit(code) && value.length < 10) {
        value += String.fromCharCode(code as number);
        effects.consume(code);
        return inside;
      }
      if (code === codes.dot || code === codes.rightParenthesis) {
        effects.exit(types.listItemValue);
        effects.enter(types.listItemMarker);
        effects.consume(code);
        effects.exit(types.listItemMarker);
        return afterMarker;
      }
      return nok(code);
    }

    function afterMarker(code: Code): State | undefined {
      // A marker needs whitespace or a line ending after it to be a marker at all, which is
      // what keeps `2.x` out: that is ordinary paragraph text on both sides.
      if (
        code === codes.eof ||
        markdownLineEnding(code) ||
        markdownSpace(code)
      ) {
        return Number(value) === 1 ? nok(code) : ok(code);
      }
      return nok(code);
    }
  },
};

/**
 * Succeeds when a QUOTED fence appears somewhere in the rest of the input.
 *
 * Run through `effects.check`, so the whole remainder is materialised and then rewound, exactly
 * as `createChunkScan` does for the rescanning inline tokenizers -- the consumes have to sit
 * inside an open token or micromark's stack desynchronises on restore.
 *
 * The scan starts at the beginning of the line that just failed to carry a `>`, which cannot
 * itself match, so any hit is genuinely later.
 */
const QUOTED_FENCE = /^[ \t]*>[ \t]*(?:```|~~~)/mu;

const quotedCloserAhead: Construct = {
  partial: true,
  tokenize: function tokenizeQuotedCloserAhead(
    effects: Effects,
    ok: State,
    nok: State,
  ): State {
    const characters: string[] = [];
    return enter;

    function enter(code: Code): State | undefined {
      // Nothing ahead at all, so no closer ahead either. Returning before `enter` is what keeps
      // the token NON-EMPTY: entering and exiting without a consume trips micromark's
      // `expected non-empty token`, which the referee then counts as a disagreement rather than
      // a crash -- an error that reads exactly like a wrong answer.
      if (code === codes.eof) return nok(code);
      effects.enter("legacyQuotedCloserAhead");
      return step(code);
    }

    function step(code: Code): State | undefined {
      if (code === codes.eof) {
        effects.exit("legacyQuotedCloserAhead");
        return QUOTED_FENCE.test(characters.join("")) ? ok(code) : nok(code);
      }
      characters.push(codeToCharacter(code));
      effects.consume(code);
      return step;
    }
  },
};

/**
 * Obsidian's blockquote: it ABSORBS a line opening a non-1 ordered marker.
 *
 * CommonMark lets an ordered item interrupt a paragraph only at 1, so `2.`, `10.` and `2)` open
 * nothing and the line continues the quote. Measured against live 1.14.4:
 *
 *     >  / 2. x        blockquote@0-1        absorbed
 *     >  / 10. / 5sp   blockquote@0-1 + code@2-2
 *     >  / 1. x        blockquote@0-0 + list@1-1    `1.` opens a block
 *     >  / <4sp>code   blockquote@0-0 + code@1-1    indented opens a block
 *     >  / -  x        blockquote@0-0 + list@1-1    a bullet opens a block
 *
 * An EMPTY quote behaves identically to one holding a paragraph, so this is about the quote's
 * openness and not any paragraph state.
 *
 * WHY HERE RATHER THAN IN THE LIST. The same rule as a list declining to open is not merely
 * risky, it is INERT: instrumented, every clause fired correctly and the construct was then
 * attempted a second time with the quote already closed, so the list opened anyway. Declining a
 * container makes the document tokenizer CLOSE containers and retry; only a container extending
 * ITSELF can claim a line, which is what this does.
 *
 * Stock is unchanged in every other respect -- the start, the exit and the `>`-marker
 * continuation are copied verbatim, so a line that really does carry a marker takes the
 * original path.
 */
export function legacyBlockQuoteSyntax(): Extension {
  return { document: { [codes.greaterThan]: [blockQuote] } };
}

const exit: Exiter = (effects: Effects): undefined => {
  effects.exit(types.blockQuote);
};

const blockQuote: Construct = {
  name: "blockQuote",
  tokenize: tokenizeBlockQuoteStart,
  continuation: { tokenize: tokenizeBlockQuoteContinuation },
  exit,
};

function tokenizeBlockQuoteStart(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;
  return start;

  function start(code: Code): State | undefined {
    if (code === codes.greaterThan) {
      const state = self.containerState;
      assert(state, "expected `containerState` to be defined in container");
      if (!state.open) {
        effects.enter(types.blockQuote, { _container: true });
        state.open = true;
      }
      effects.enter(types.blockQuotePrefix);
      effects.enter(types.blockQuoteMarker);
      effects.consume(code);
      effects.exit(types.blockQuoteMarker);
      return after;
    }
    return nok(code);
  }

  /**
   * A SPACE, never a tab, is the marker's own whitespace.
   *
   * `remark-parse@8` consumes the `>` and then at most one space, so a tab survives into the
   * quote's content and indents it. `markdownSpace` admits a tab here, spending it as padding
   * and leaving the content a paragraph.
   *
   * Inert on its own: this alone raises the content's indentation from two codes to three, where
   * four is needed. `legacyIndentedCodeSyntax` reads one raw tab as a whole indent and
   * `legacyFootnoteDefinitionSyntax` does the same for a definition's continuation; the three
   * only work together, and the measured rows live with the first of them.
   */
  function after(code: Code): State | undefined {
    if (code === codes.space) {
      effects.enter(types.blockQuotePrefixWhitespace);
      effects.consume(code);
      effects.exit(types.blockQuotePrefixWhitespace);
      effects.exit(types.blockQuotePrefix);
      return ok;
    }
    effects.exit(types.blockQuotePrefix);
    return ok(code);
  }
}

function tokenizeBlockQuoteContinuation(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;
  return contStart;

  function contStart(code: Code): State | undefined {
    if (markdownSpace(code)) {
      assert(
        self.parser.constructs.disable.null,
        "expected `disable.null` to be populated",
      );
      return factorySpace(
        effects,
        contBefore,
        types.linePrefix,
        self.parser.constructs.disable.null.includes("codeIndented")
          ? undefined
          : constants.tabSize,
      )(code);
    }
    return contBefore(code);
  }

  function contBefore(code: Code): State | undefined {
    // Only for a quote that is already OPEN. This tokenizer also parses the first opening, and
    // absorbing there would make a bare `2. x` document open a blockquote.
    if (self.containerState?.open === true) {
      return effects.check(orderedMarkerNotOne, absorb, attemptMarker)(code);
    }
    return attemptMarker(code);
  }

  function absorb(code: Code): State | undefined {
    // No prefix is consumed, so the whole line reaches the quote's child flow -- which is what
    // makes `> q` / `2. x` one paragraph and `>` / `10.` / `<5sp>x` a quote plus root code.
    return ok(code);
  }

  function attemptMarker(code: Code): State | undefined {
    return effects.attempt(blockQuote, ok, declined)(code);
  }

  function declined(code: Code): State | undefined {
    // Only for an OPEN quote: this tokenizer also runs for the first opening, where a failure
    // means "no quote here at all" rather than "an open quote did not continue".
    if (self.containerState?.open === true) {
      markQuoteLazyLine(self.parser, self.now().line);
      // A FENCE HOLDS THE QUOTE OPEN, but only one that is going to be CLOSED. Absorbing
      // whenever a fence was open took 29 documents whose quoted fence never reaches a quoted
      // closer: there Obsidian ends the block with the quote and parses the rest of the file as
      // ordinary flow, so swallowing it lost every definition below. The condition is therefore
      // a LOOKAHEAD, which is why it cannot live in the fence's own continuation.
      // ...but NOT a BLANK line, which ends a quoted fence however far its closer is. Measured
      // against live 1.15.0, with the quote/root asymmetry as the control:
      //
      //     > ``` / > a / > [^b]: def / > ```        defs []      the fence holds
      //     > ``` / > a / BLANK / [^b]: def / > ```  defs ["b"]   the blank ENDED it
      //     > ``` / > a / BLANK / > [^b]: def / ...  defs ["b"]   even re-quoted, still ended
      //     ``` / a / BLANK / [^b]: def / ```        defs []      at ROOT a blank ends nothing
      //
      // The last row is why this belongs here and not in the fence: a root fence spans its
      // blank lines, so the rule is the QUOTE's, matching the same asymmetry already recorded
      // for a `%%` region. Absorbing blanks was this rule's own defect on arrival.
      if (markdownLineEnding(code) || code === codes.eof) return nok(code);
      if (isFenceOpen(self.parser)) {
        return effects.check(quotedCloserAhead, absorb, nok)(code);
      }
    }
    return nok(code);
  }
}
