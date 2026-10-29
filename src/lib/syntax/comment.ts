import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";

const PERCENT = 37;
const LINE_FEED = -4;
const CARRIAGE_RETURN = -3;
const CARRIAGE_RETURN_LINE_FEED = -5;

function isLineEnding(code: Code): code is number {
  return (
    code === LINE_FEED ||
    code === CARRIAGE_RETURN ||
    code === CARRIAGE_RETURN_LINE_FEED
  );
}

const commentFlow: Construct = {
  tokenize: tokenizeFlow,
  concrete: true,
  name: "commentFlow",
};

const nonLazyContinuation: Construct = {
  tokenize: tokenizeNonLazyContinuation,
  partial: true,
};

/**
 * Rewindable lookahead for any further percent on the opening line.
 *
 * Obsidian prefers an inline comment whenever one could close on the same
 * line, so `%%text%%` is a paragraph holding a hidden comment rather than a
 * block comment -- a block one only wins when the construct spans lines. The
 * test is stricter than that implies: a single stray `%` disqualifies the
 * opener too, which is why `%% 50%` and `%%%` are plain paragraphs.
 */
const noCloserOnOpeningLine: Construct = {
  partial: true,
  tokenize(effects, ok, nok) {
    return start;

    function start(code: Code): State | undefined {
      if (code !== PERCENT) return nok(code);
      effects.enter("chunkString", { contentType: "string" });
      effects.consume(code);
      return second;
    }

    function second(code: Code): State | undefined {
      if (code !== PERCENT) return nok(code);
      effects.consume(code);
      return scan;
    }

    function scan(code: Code): State | undefined {
      if (code === null || isLineEnding(code)) {
        effects.exit("chunkString");
        return ok(code);
      }
      // Any further percent at all, not just a second `%%`. Measured: `%% 50%`
      // and `%%%` are ordinary paragraphs in Obsidian, so one stray `%` is
      // enough to disqualify the opener -- which also covers the closer case
      // this used to check separately, since `%%text%%` stays inline.
      if (code === PERCENT) {
        effects.exit("chunkString");
        return nok(code);
      }
      effects.consume(code);
      return scan;
    }
  },
};

export function commentSyntax(): Extension {
  return {
    text: {
      [PERCENT]: { name: "comment", tokenize: tokenizeText },
    },
    flow: {
      [PERCENT]: commentFlow,
    },
  };
}

// A token may never span a line ending. `commentContent` is therefore closed
// before each line break and reopened after it, with a real `lineEnding` token
// in between. Omitting those tokens desynchronizes micromark's linked
// `chunkText` chain and makes `subtokenize` read past its splice buffer.
function tokenizeText(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const closeFromContent = createClose(true);
  const closeFromBoundary = createClose(false);
  // Obsidian's rule, as remark-parse 8's block and inline readers have it: a comment spans
  // lines only when its `%%` opens a line and nothing else on that line is a `%`; any other
  // closes on its own line or is text. `a %%x` / `y%% b`, `a` / `····%%note` / `note%%` and
  // `%%%` / `[^1]: def` / `%%%` render as written (asked of 1.15.0), where this construct read
  // comments across the line endings.
  const opensLine = this.previous === null || isLineEnding(this.previous);
  let firstLine = true;
  let strayPercent = false;

  return start;

  /** Whether the comment may go on past the line ending it has reached. */
  function spansLines(): boolean {
    if (!opensLine || (firstLine && strayPercent)) return false;
    firstLine = false;
    return true;
  }

  /** A `%` that closes nothing: on the opening line it keeps the comment to that line. */
  function strayStart(code: Code): State | undefined {
    if (firstLine) strayPercent = true;
    return startContent(code);
  }

  function strayConsume(code: Code): State | undefined {
    if (firstLine) strayPercent = true;
    return contentConsume(code);
  }

  function start(code: Code): State | undefined {
    if (code !== PERCENT) return nok(code);
    effects.enter("comment");
    effects.enter("commentMarker");
    effects.consume(code);
    return openSecond;
  }

  function openSecond(code: Code): State | undefined {
    if (code !== PERCENT) return nok(code);
    effects.consume(code);
    effects.exit("commentMarker");
    return atContentBoundary;
  }

  function atContentBoundary(code: Code): State | undefined {
    if (code === null) return nok(code);

    if (isLineEnding(code)) {
      if (!spansLines()) return nok(code);
      return effects.attempt(nonLazyContinuation, atContentBoundary, nok)(code);
    }

    if (code === PERCENT) {
      return effects.attempt(closeFromBoundary, closeAfter, strayStart)(code);
    }

    effects.enter("commentContent");
    effects.consume(code);
    return content;
  }

  function startContent(code: Code): State | undefined {
    if (code === null) return nok(code);
    effects.enter("commentContent");
    effects.consume(code);
    return content;
  }

  function content(code: Code): State | undefined {
    if (code === null) {
      effects.exit("commentContent");
      return nok(code);
    }

    if (isLineEnding(code)) {
      effects.exit("commentContent");
      if (!spansLines()) return nok(code);
      return effects.attempt(nonLazyContinuation, atContentBoundary, nok)(code);
    }

    if (code === PERCENT) {
      return effects.attempt(closeFromContent, closeAfter, strayConsume)(code);
    }

    effects.consume(code);
    return content;
  }

  function contentConsume(code: Code): State | undefined {
    if (code === null) {
      effects.exit("commentContent");
      return nok(code);
    }
    effects.consume(code);
    return content;
  }

  function closeAfter(code: Code): State | undefined {
    effects.exit("comment");
    return ok(code);
  }

  function createClose(hasOpenContent: boolean): Construct {
    return {
      partial: true,
      tokenize: function tokenizeClose(
        this: TokenizeContext,
        closeEffects: Effects,
        closeOk: State,
        closeNok: State,
      ): State {
        return closeStart;

        function closeStart(closeCode: Code): State | undefined {
          if (closeCode !== PERCENT) return closeNok(closeCode);
          if (hasOpenContent) closeEffects.exit("commentContent");
          closeEffects.enter("commentMarker");
          closeEffects.consume(closeCode);
          return closeSecond;
        }

        function closeSecond(closeCode: Code): State | undefined {
          if (closeCode !== PERCENT) return closeNok(closeCode);
          closeEffects.consume(closeCode);
          closeEffects.exit("commentMarker");
          return closeOk;
        }
      },
    };
  }
}

function tokenizeFlow(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;
  const flowClose: Construct = {
    tokenize: tokenizeFlowClose,
    partial: true,
  };

  return checkOpeningLine;

  function checkOpeningLine(code: Code): State | undefined {
    return effects.check(noCloserOnOpeningLine, start, nok)(code);
  }

  function start(code: Code): State | undefined {
    if (code !== PERCENT) return nok(code);
    effects.enter("comment");
    effects.enter("commentMarker");
    effects.consume(code);
    return openSecond;
  }

  function openSecond(code: Code): State | undefined {
    if (code !== PERCENT) return nok(code);
    effects.consume(code);
    effects.exit("commentMarker");
    return beforeContentChunk;
  }

  function beforeContentChunk(code: Code): State | undefined {
    if (code === null) {
      effects.exit("comment");
      return ok(code);
    }

    if (isLineEnding(code)) {
      return effects.attempt(
        nonLazyContinuation,
        beforeContentChunk,
        afterLazy,
      )(code);
    }

    if (code === PERCENT) {
      return effects.attempt(
        flowClose,
        closeAfterLineStart,
        startContent,
      )(code);
    }

    effects.enter("commentContent");
    return contentChunk(code);
  }

  function startContent(code: Code): State | undefined {
    effects.enter("commentContent");
    effects.consume(code);
    return contentChunk;
  }

  function contentChunk(code: Code): State | undefined {
    if (code === null) {
      effects.exit("commentContent");
      effects.exit("comment");
      return ok(code);
    }

    if (code === PERCENT) {
      return effects.attempt(
        flowClose,
        closeAfterMidLine,
        contentConsume,
      )(code);
    }

    if (isLineEnding(code)) {
      effects.exit("commentContent");
      return effects.attempt(
        nonLazyContinuation,
        beforeContentChunk,
        afterLazy,
      )(code);
    }

    effects.consume(code);
    return contentChunk;
  }

  function contentConsume(code: Code): State | undefined {
    if (code === null) {
      effects.exit("commentContent");
      effects.exit("comment");
      return ok(code);
    }
    effects.consume(code);
    return contentChunk;
  }

  /**
   * Obsidian ends a block comment at its closing `%%` wherever that falls and
   * reparses the rest of the line as a new block. Flow owns whole lines, so this
   * construct cannot stop mid-line, and the two reachable approximations are not
   * equally good — which one is right depends on where the closer sits.
   *
   * **Mid-line closer** (`line %% nested %% line`): reject, and the line becomes
   * paragraph content where the *text* tokenizer handles `%%…%%` inline. That
   * reproduces Obsidian's split exactly, including leaving the tail visible.
   *
   * **Closer starting its line** (`%% [^a]: def`): reject and the opener's lines
   * fall back to a paragraph, but this very construct then re-fires on the closer
   * line — whose own line holds no second `%%` — opening a fresh comment that runs
   * to end of file and swallows the remainder of the note. Absorbing the closer's
   * line instead keeps every later block alive.
   */
  function closeAfterLineStart(code: Code): State | undefined {
    if (code === null || isLineEnding(code)) {
      effects.exit("comment");
      return ok(code);
    }
    effects.enter("commentContent");
    return absorbCloserLine(code);
  }

  function absorbCloserLine(code: Code): State | undefined {
    if (code === null || isLineEnding(code)) {
      effects.exit("commentContent");
      effects.exit("comment");
      return ok(code);
    }
    effects.consume(code);
    return absorbCloserLine;
  }

  function closeAfterMidLine(code: Code): State | undefined {
    if (code !== null && !isLineEnding(code)) return nok(code);
    effects.exit("comment");
    return ok(code);
  }

  function afterLazy(code: Code): State | undefined {
    effects.exit("comment");
    return ok(code);
  }

  function tokenizeFlowClose(
    this: TokenizeContext,
    closeEffects: Effects,
    closeOk: State,
    closeNok: State,
  ): State {
    let inContent = false;
    return closeStart;

    function closeStart(closeCode: Code): State | undefined {
      if (closeCode !== PERCENT) return closeNok(closeCode);
      const current = self.events[self.events.length - 1];
      if (
        current &&
        current[0] === "enter" &&
        current[1].type === "commentContent"
      ) {
        closeEffects.exit("commentContent");
        inContent = true;
      }
      closeEffects.enter("commentMarker");
      closeEffects.consume(closeCode);
      return closeSecond;
    }

    function closeSecond(closeCode: Code): State | undefined {
      if (closeCode !== PERCENT) {
        if (inContent) {
          closeEffects.exit("commentMarker");
          closeEffects.enter("commentContent");
        }
        return closeNok(closeCode);
      }
      closeEffects.consume(closeCode);
      closeEffects.exit("commentMarker");
      return closeOk;
    }
  }
}

function tokenizeNonLazyContinuation(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;
  return start;

  function start(code: Code): State | undefined {
    if (code === null) {
      return ok(code);
    }
    if (!isLineEnding(code)) return nok(code);
    effects.enter("lineEnding");
    effects.consume(code);
    effects.exit("lineEnding");
    return lineStart;
  }

  function lineStart(code: Code): State | undefined {
    return self.parser.lazy[self.now().line] ? nok(code) : ok(code);
  }
}
