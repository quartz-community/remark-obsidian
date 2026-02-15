import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";
import { codes } from "micromark-util-symbol";

const EQUALS = 61;

function isLineEnding(code: Code): boolean {
  return code === codes.lineFeed || code === codes.carriageReturn;
}

export function highlightSyntax(): Extension {
  return {
    text: {
      [EQUALS]: { name: "highlight", tokenize },
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
  let hasContent = false;
  return start;

  function start(code: Code): State | undefined {
    if (code !== EQUALS) return nok(code);
    effects.enter("highlight");
    effects.enter("highlightMarker");
    effects.consume(code);
    return openSecond;
  }

  function openSecond(code: Code): State | undefined {
    if (code !== EQUALS) return nok(code);
    effects.consume(code);
    effects.exit("highlightMarker");
    effects.enter("highlightContent");
    return content;
  }

  function content(code: Code): State | undefined {
    if (code === null || isLineEnding(code)) return nok(code);
    if (!hasContent && (code === EQUALS || code === codes.greaterThan))
      return nok(code);
    if (code === EQUALS)
      return effects.attempt(close, closeAfter, contentConsume)(code);
    effects.consume(code);
    hasContent = true;
    return content;
  }

  function contentConsume(code: Code): State | undefined {
    if (code === null || isLineEnding(code)) return nok(code);
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
      if (closeCode !== EQUALS) return closeNok(closeCode);
      closeEffects.exit("highlightContent");
      closeEffects.enter("highlightMarker");
      closeEffects.consume(closeCode);
      return closeSecond;
    }

    function closeSecond(closeCode: Code): State | undefined {
      if (closeCode !== EQUALS) return closeNok(closeCode);
      closeEffects.consume(closeCode);
      closeEffects.exit("highlightMarker");
      return closeOk;
    }
  }

  function closeAfter(code: Code): State | undefined {
    effects.exit("highlight");
    return ok(code);
  }
}
