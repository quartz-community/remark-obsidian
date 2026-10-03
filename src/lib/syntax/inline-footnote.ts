import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";
import { codes, types } from "micromark-util-symbol";

const CARET = 94;
const LEFT_BRACKET = 91;
const RIGHT_BRACKET = 93;
const BACKSLASH = 92;

function isLineEnding(code: Code): boolean {
  return (
    code === codes.lineFeed ||
    code === codes.carriageReturn ||
    code === codes.carriageReturnLineFeed
  );
}

/**
 * `^[body]`, Obsidian's inline footnote. Not a GFM construct, so `remark-gfm`
 * leaves it as literal text.
 *
 * Every rule here is measured against Obsidian 1.14.2 rather than reasoned about,
 * after two guesses proved wrong: an **empty** body is still a footnote (`^[]`
 * renders a marker), and the body **may span lines** (`^[a\nb]` is one footnote).
 * The body also holds balanced brackets, so `^[body with [a link](u)]` closes on
 * the final `]`; it swallows a reference-shaped string, making `^[^literal]`
 * footnote text rather than a reference to `literal`; and an escaped caret is not
 * an opener, so `\^[^x]` leaves a real reference — which stock `remark-footnotes`
 * gets wrong.
 */
export function inlineFootnoteSyntax(): Extension {
  return {
    text: {
      [CARET]: { name: "inlineFootnote", tokenize },
    },
  };
}

/** A line ending continues the body only when the next line is not lazy. */
const nonLazyContinuation: Construct = {
  partial: true,
  tokenize: function tokenizeNonLazy(
    this: TokenizeContext,
    effects: Effects,
    ok: State,
    nok: State,
  ): State {
    const self = this;
    return start;

    function start(code: Code): State | undefined {
      if (!isLineEnding(code)) return nok(code);
      effects.enter(types.lineEnding);
      effects.consume(code);
      effects.exit(types.lineEnding);
      return lineStart;
    }

    function lineStart(code: Code): State | undefined {
      return self.parser.lazy[self.now().line] ? nok(code) : ok(code);
    }
  },
};

function tokenize(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  let depth = 0;

  return start;

  function start(code: Code): State | undefined {
    if (code !== CARET) return nok(code);
    effects.enter("inlineFootnote");
    effects.enter("inlineFootnoteMarker");
    effects.consume(code);
    return afterCaret;
  }

  function afterCaret(code: Code): State | undefined {
    if (code !== LEFT_BRACKET) return nok(code);
    effects.consume(code);
    effects.exit("inlineFootnoteMarker");
    depth = 1;
    return atBoundary;
  }

  /**
   * A content token may never span a line ending, so the body is emitted as one
   * token per line with a real `lineEnding` between them. Omitting those tokens
   * desynchronises micromark's linked `chunkText` chain and makes `subtokenize`
   * read past its splice buffer.
   */
  function atBoundary(code: Code): State | undefined {
    if (code === null) return nok(code);
    if (code === RIGHT_BRACKET) return closeHere(code);
    if (isLineEnding(code)) {
      return effects.attempt(nonLazyContinuation, atBoundary, nok)(code);
    }
    effects.enter("inlineFootnoteContent", { contentType: "text" });
    return content(code);
  }

  function content(code: Code): State | undefined {
    if (code === null) {
      effects.exit("inlineFootnoteContent");
      return nok(code);
    }

    if (isLineEnding(code)) {
      effects.exit("inlineFootnoteContent");
      return effects.attempt(nonLazyContinuation, atBoundary, nok)(code);
    }

    if (code === BACKSLASH) {
      effects.consume(code);
      return escaped;
    }

    if (code === LEFT_BRACKET) {
      depth++;
      effects.consume(code);
      return content;
    }

    if (code === RIGHT_BRACKET) {
      depth--;
      if (depth === 0) {
        effects.exit("inlineFootnoteContent");
        return closeHere(code);
      }
      effects.consume(code);
      return content;
    }

    effects.consume(code);
    return content;
  }

  function escaped(code: Code): State | undefined {
    if (code === null || isLineEnding(code)) {
      effects.exit("inlineFootnoteContent");
      return nok(code);
    }
    effects.consume(code);
    return content;
  }

  function closeHere(code: Code): State | undefined {
    effects.enter("inlineFootnoteMarker");
    effects.consume(code);
    effects.exit("inlineFootnoteMarker");
    effects.exit("inlineFootnote");
    return ok;
  }
}
