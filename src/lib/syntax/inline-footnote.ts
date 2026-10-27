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

/**
 * A line ending inside the body, which continues it onto the next line -- a lazy one too:
 * `- ^[i` / `e]` is one footnote in Obsidian, the second line a lazy continuation of the item.
 */
const bodyLineEnding: Construct = {
  partial: true,
  tokenize: function tokenizeBodyLineEnding(
    effects: Effects,
    ok: State,
    nok: State,
  ): State {
    return start;

    function start(code: Code): State | undefined {
      if (!isLineEnding(code)) return nok(code);
      effects.enter(types.lineEnding);
      effects.consume(code);
      effects.exit(types.lineEnding);
      return ok;
    }
  },
};

interface CloserMemo {
  /** Offset from which no `]` remains, so no opener can close. */
  noCloserFrom?: number;
}

/**
 * Remember the point past which no closer exists, for the whole document.
 *
 * Every opener scans forward for a balanced `]`, so a run of openers with no
 * `]` anywhere costs one full scan each: `^[` twenty thousand times took
 * twenty-one seconds where the bare chain took a hundred and sixty
 * milliseconds. That is quadratic, and a note anyone can write.
 *
 * The recorded fact is "no `]` remains from here", not "this attempt failed".
 * The weaker condition would be unsound for a scanner that counts depth:
 * `^[^[ ]` exhausts the input from the first caret, because the inner `[`
 * raises the depth a single `]` cannot clear, and yet succeeds from the second
 * -- so a failure says nothing about later positions. The absence of any `]`
 * does, since a later opener searches a subset of the same region.
 */
function memoFor(parser: unknown): CloserMemo {
  const host = parser as { inlineFootnoteCloserMemo?: CloserMemo };
  host.inlineFootnoteCloserMemo ??= {};
  return host.inlineFootnoteCloserMemo;
}

function tokenize(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;
  let depth = 0;
  let sawBracket = false;
  let openerAt = 0;

  return start;

  /** Exhausted the input; only a run that never met a `]` proves anything. */
  function exhausted(code: Code): State | undefined {
    if (!sawBracket) memoFor(self.parser).noCloserFrom = openerAt;
    return nok(code);
  }

  function start(code: Code): State | undefined {
    if (code !== CARET) return nok(code);
    openerAt = self.now().offset ?? 0;
    const memo = memoFor(self.parser);
    if (memo.noCloserFrom !== undefined && openerAt >= memo.noCloserFrom) {
      return nok(code);
    }
    sawBracket = false;
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
    if (code === null) return exhausted(code);
    if (code === RIGHT_BRACKET) {
      sawBracket = true;
      return closeHere(code);
    }
    if (isLineEnding(code)) {
      return effects.attempt(bodyLineEnding, atBoundary, nok)(code);
    }
    effects.enter("inlineFootnoteContent", { contentType: "text" });
    return content(code);
  }

  function content(code: Code): State | undefined {
    if (code === null) {
      effects.exit("inlineFootnoteContent");
      return exhausted(code);
    }

    if (isLineEnding(code)) {
      effects.exit("inlineFootnoteContent");
      return effects.attempt(bodyLineEnding, atBoundary, nok)(code);
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
      sawBracket = true;
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
    if (code === null) {
      effects.exit("inlineFootnoteContent");
      return exhausted(code);
    }
    if (isLineEnding(code)) {
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
