import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";

const PERCENT = 37;

export function commentSyntax(): Extension {
  return {
    text: {
      [PERCENT]: { name: "comment", tokenize },
    },
    flow: {
      [PERCENT]: { name: "comment", tokenize },
    },
  };
}

function tokenize(
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
