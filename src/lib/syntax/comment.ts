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
 * Rewindable lookahead for a second `%%` later on the opening line. Obsidian
 * prefers an inline comment whenever one could close on the same line, so
 * `%%text%%` is a paragraph containing a hidden comment rather than a block
 * comment. A block comment only wins when the construct spans lines.
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
      if (code === PERCENT) {
        effects.consume(code);
        return maybeCloser;
      }
      effects.consume(code);
      return scan;
    }

    function maybeCloser(code: Code): State | undefined {
      if (code === PERCENT) {
        effects.exit("chunkString");
        return nok(code);
      }
      if (code === null || isLineEnding(code)) {
        effects.exit("chunkString");
        return ok(code);
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

  return start;

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
      return effects.attempt(nonLazyContinuation, atContentBoundary, nok)(code);
    }

    if (code === PERCENT) {
      return effects.attempt(closeFromBoundary, closeAfter, startContent)(code);
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

      return effects.attempt(nonLazyContinuation, atContentBoundary, nok)(code);
    }

    if (code === PERCENT) {
      return effects.attempt(
        closeFromContent,
        closeAfter,
        contentConsume,
      )(code);
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
      return effects.attempt(flowClose, closeAfter, startContent)(code);
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
      return effects.attempt(flowClose, closeAfter, contentConsume)(code);
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

  // Flow owns whole lines, so succeeding mid-line trips micromark's `expected eol
  // or eof`. `%%x%% trailing` must nok here and re-parse as a paragraph, where the
  // text tokenizer handles the comment inline.
  function closeAfter(code: Code): State | undefined {
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
