import type {
  Code,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";

const DASH = 45;
const EQUALS = 61;
const LEFT_ANGLE = 60;
const RIGHT_ANGLE = 62;

export function arrowSyntax(): Extension {
  return {
    text: {
      [DASH]: { name: "arrow", tokenize: tokenizeDash },
      [EQUALS]: { name: "arrow", tokenize: tokenizeEquals },
      [LEFT_ANGLE]: { name: "arrow", tokenize: tokenizeLeftAngle },
    },
  };
}

function tokenizeDash(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  return start;

  function start(code: Code): State | undefined {
    if (code !== DASH) return nok(code);
    effects.enter("arrow");
    effects.enter("arrowContent");
    effects.consume(code);
    return afterFirst;
  }

  function afterFirst(code: Code): State | undefined {
    if (code === RIGHT_ANGLE) {
      effects.consume(code);
      effects.exit("arrowContent");
      effects.exit("arrow");
      return ok;
    }

    if (code === DASH) {
      effects.consume(code);
      return afterSecond;
    }

    return nok(code);
  }

  function afterSecond(code: Code): State | undefined {
    if (code !== RIGHT_ANGLE) return nok(code);
    effects.consume(code);
    effects.exit("arrowContent");
    effects.exit("arrow");
    return ok;
  }
}

function tokenizeEquals(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  return start;

  function start(code: Code): State | undefined {
    if (code !== EQUALS) return nok(code);
    effects.enter("arrow");
    effects.enter("arrowContent");
    effects.consume(code);
    return afterFirst;
  }

  function afterFirst(code: Code): State | undefined {
    if (code === RIGHT_ANGLE) {
      effects.consume(code);
      effects.exit("arrowContent");
      effects.exit("arrow");
      return ok;
    }

    if (code === EQUALS) {
      effects.consume(code);
      return afterSecond;
    }

    return nok(code);
  }

  function afterSecond(code: Code): State | undefined {
    if (code !== RIGHT_ANGLE) return nok(code);
    effects.consume(code);
    effects.exit("arrowContent");
    effects.exit("arrow");
    return ok;
  }
}

function tokenizeLeftAngle(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  return start;

  function start(code: Code): State | undefined {
    if (code !== LEFT_ANGLE) return nok(code);
    effects.enter("arrow");
    effects.enter("arrowContent");
    effects.consume(code);
    return afterLeft;
  }

  function afterLeft(code: Code): State | undefined {
    if (code === DASH) {
      effects.consume(code);
      return leftDash;
    }

    if (code === EQUALS) {
      effects.consume(code);
      return leftEquals;
    }

    return nok(code);
  }

  function leftDash(code: Code): State | undefined {
    if (code === DASH) {
      effects.consume(code);
      effects.exit("arrowContent");
      effects.exit("arrow");
      return ok;
    }
    effects.exit("arrowContent");
    effects.exit("arrow");
    return ok(code);
  }

  function leftEquals(code: Code): State | undefined {
    if (code === EQUALS) {
      effects.consume(code);
      effects.exit("arrowContent");
      effects.exit("arrow");
      return ok;
    }
    effects.exit("arrowContent");
    effects.exit("arrow");
    return ok(code);
  }
}
