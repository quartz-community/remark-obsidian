import type {
  Code,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";
import { codes } from "micromark-util-symbol";

const HASH = 35;
const SLASH = 47;
const DASH = 45;
const UNDERSCORE = 95;

const tagCharRegex = /[\p{L}\p{M}\p{Emoji}]/u;

function isWhitespace(code: Code): boolean {
  return (
    code === codes.space ||
    code === codes.horizontalTab ||
    code === codes.lineFeed ||
    code === codes.carriageReturn ||
    code === codes.carriageReturnLineFeed
  );
}

function isTagChar(code: Code): boolean {
  if (code === null) return false;
  if (code >= 48 && code <= 57) return true;
  if (code === DASH || code === UNDERSCORE) return true;
  return tagCharRegex.test(String.fromCodePoint(code));
}

function isNonDigit(code: Code): boolean {
  if (code === null) return false;
  return !(code >= 48 && code <= 57);
}

export function tagSyntax(): Extension {
  return {
    text: {
      [HASH]: { name: "tag", tokenize },
    },
  };
}

function tokenize(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  let hasNonDigit = false;
  const context = this;

  return start;

  function start(code: Code): State | undefined {
    const previous = context.previous;
    const allowedStart =
      previous === null || isWhitespace(previous) || previous === HASH;
    if (!allowedStart) return nok(code);
    if (code !== HASH) return nok(code);
    effects.enter("tag");
    effects.enter("tagMarker");
    effects.consume(code);
    effects.exit("tagMarker");
    return tagStart;
  }

  function tagStart(code: Code): State | undefined {
    if (!isTagChar(code)) return nok(code);
    effects.enter("tagContent");
    if (isNonDigit(code)) hasNonDigit = true;
    effects.consume(code);
    return tagContent;
  }

  function tagContent(code: Code): State | undefined {
    if (code === SLASH) {
      effects.consume(code);
      return afterSlash;
    }

    if (isTagChar(code)) {
      if (isNonDigit(code)) hasNonDigit = true;
      effects.consume(code);
      return tagContent;
    }

    return end(code);
  }

  function afterSlash(code: Code): State | undefined {
    if (!isTagChar(code)) return nok(code);
    if (isNonDigit(code)) hasNonDigit = true;
    effects.consume(code);
    return tagContent;
  }

  function end(code: Code): State | undefined {
    if (!hasNonDigit) return nok(code);
    effects.exit("tagContent");
    effects.exit("tag");
    return ok(code);
  }
}
