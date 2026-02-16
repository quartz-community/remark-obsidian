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

function tokenizeText(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const close: Construct = { tokenize: tokenizeClose, partial: true };
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
    effects.enter("commentContent");
    return content;
  }

  function content(code: Code): State | undefined {
    if (code === null) return nok(code);
    if (code === PERCENT)
      return effects.attempt(close, closeAfter, contentConsume)(code);
    effects.consume(code);
    return content;
  }

  function contentConsume(code: Code): State | undefined {
    if (code === null) return nok(code);
    effects.consume(code);
    return content;
  }

  function tokenizeClose(
    this: TokenizeContext,
    closeEffects: Effects,
    closeOk: State,
    closeNok: State,
  ): State {
    return closeStart;

    function closeStart(closeCode: Code): State | undefined {
      if (closeCode !== PERCENT) return closeNok(closeCode);
      closeEffects.exit("commentContent");
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
  }

  function closeAfter(code: Code): State | undefined {
    effects.exit("comment");
    return ok(code);
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
    return afterOpen;
  }

  function afterOpen(code: Code): State | undefined {
    if (code === null) return nok(code);

    if (isLineEnding(code)) {
      return effects.attempt(
        nonLazyContinuation,
        beforeContentChunk,
        abandon,
      )(code);
    }

    effects.enter("commentContent");
    return contentChunk(code);
  }

  function beforeContentChunk(code: Code): State | undefined {
    if (code === null) {
      return abandon(code);
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
    if (code === null) return abandon(code);

    if (code === PERCENT) {
      return effects.attempt(flowClose, closeAfter, contentConsume)(code);
    }

    if (isLineEnding(code)) {
      effects.exit("commentContent");
      return effects.attempt(
        nonLazyContinuation,
        beforeContentChunk,
        abandon,
      )(code);
    }

    effects.consume(code);
    return contentChunk;
  }

  function contentConsume(code: Code): State | undefined {
    if (code === null) return abandon(code);
    effects.consume(code);
    return contentChunk;
  }

  function closeAfter(code: Code): State | undefined {
    effects.exit("comment");
    return ok(code);
  }

  function abandon(code: Code): State | undefined {
    effects.exit("comment");
    return nok(code);
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
