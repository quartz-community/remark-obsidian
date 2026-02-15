import type {
  Code,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";
import { codes } from "micromark-util-symbol";

const EXCLAMATION = 33;
const HASH = 35;
const LEFT_BRACKET = 91;
const BACKSLASH = 92;
const RIGHT_BRACKET = 93;
const PIPE = 124;

function isLineEnding(code: Code): boolean {
  return code === codes.lineFeed || code === codes.carriageReturn;
}

export function wikilinkSyntax(): Extension {
  return {
    text: {
      [LEFT_BRACKET]: { name: "wikilink", tokenize },
      [EXCLAMATION]: { name: "wikilink", tokenize },
    },
  };
}

function tokenize(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  let hasPath = false;
  let hasHeading = false;
  let hasAlias = false;

  return start;

  function start(code: Code): State | undefined {
    if (code === EXCLAMATION) {
      effects.enter("wikilink");
      effects.enter("wikilinkEmbedMarker");
      effects.consume(code);
      effects.exit("wikilinkEmbedMarker");
      return openFirst;
    }

    if (code === LEFT_BRACKET) {
      effects.enter("wikilink");
      return openFirst(code);
    }

    return nok(code);
  }

  function openFirst(code: Code): State | undefined {
    if (code !== LEFT_BRACKET) return nok(code);
    effects.enter("wikilinkMarker");
    effects.consume(code);
    return openSecond;
  }

  function openSecond(code: Code): State | undefined {
    if (code !== LEFT_BRACKET) return nok(code);
    effects.consume(code);
    effects.exit("wikilinkMarker");
    return pathStart;
  }

  function pathStart(code: Code): State | undefined {
    if (code === HASH) return headingMarker(code);
    if (code === PIPE) return nok(code);
    if (code === RIGHT_BRACKET || code === null || isLineEnding(code))
      return nok(code);
    effects.enter("wikilinkPath");
    hasPath = true;
    return path(code);
  }

  function path(code: Code): State | undefined {
    if (code === BACKSLASH) {
      effects.consume(code);
      return pathEscape;
    }

    if (code === HASH) {
      effects.exit("wikilinkPath");
      return headingMarker(code);
    }

    if (code === PIPE) {
      effects.exit("wikilinkPath");
      return aliasMarker(code);
    }

    if (code === RIGHT_BRACKET) {
      effects.exit("wikilinkPath");
      return closeFirst(code);
    }

    if (code === null || isLineEnding(code)) return nok(code);

    effects.consume(code);
    return path;
  }

  function pathEscape(code: Code): State | undefined {
    if (code === PIPE) {
      effects.exit("wikilinkPath");
      return aliasMarker(code);
    }
    if (code === null || isLineEnding(code)) return nok(code);
    effects.consume(code);
    return path;
  }

  function headingMarker(code: Code): State | undefined {
    if (code !== HASH) return nok(code);
    effects.enter("wikilinkHeadingMarker");
    effects.consume(code);
    effects.exit("wikilinkHeadingMarker");
    return headingStart;
  }

  function headingStart(code: Code): State | undefined {
    if (code === PIPE) return nok(code);
    if (code === RIGHT_BRACKET || code === null || isLineEnding(code))
      return nok(code);
    effects.enter("wikilinkHeading");
    hasHeading = true;
    return heading(code);
  }

  function heading(code: Code): State | undefined {
    if (code === BACKSLASH) {
      effects.consume(code);
      return headingEscape;
    }

    if (code === PIPE) {
      effects.exit("wikilinkHeading");
      return aliasMarker(code);
    }

    if (code === RIGHT_BRACKET) {
      effects.exit("wikilinkHeading");
      return closeFirst(code);
    }

    if (code === null || isLineEnding(code)) return nok(code);

    effects.consume(code);
    return heading;
  }

  function headingEscape(code: Code): State | undefined {
    if (code === PIPE) {
      effects.exit("wikilinkHeading");
      return aliasMarker(code);
    }
    if (code === null || isLineEnding(code)) return nok(code);
    effects.consume(code);
    return heading;
  }

  function aliasMarker(code: Code): State | undefined {
    if (code !== PIPE) return nok(code);
    effects.enter("wikilinkAliasMarker");
    effects.consume(code);
    effects.exit("wikilinkAliasMarker");
    return aliasStart;
  }

  function aliasStart(code: Code): State | undefined {
    if (code === RIGHT_BRACKET) return closeFirst(code);
    if (code === null || isLineEnding(code)) return nok(code);
    effects.enter("wikilinkAlias");
    hasAlias = true;
    return alias(code);
  }

  function alias(code: Code): State | undefined {
    if (code === RIGHT_BRACKET) {
      effects.exit("wikilinkAlias");
      return closeFirst(code);
    }

    if (code === null || isLineEnding(code)) return nok(code);

    effects.consume(code);
    return alias;
  }

  function closeFirst(code: Code): State | undefined {
    if (code !== RIGHT_BRACKET) return nok(code);
    if (!hasPath && !hasHeading && !hasAlias) return nok(code);
    effects.enter("wikilinkMarker");
    effects.consume(code);
    return closeSecond;
  }

  function closeSecond(code: Code): State | undefined {
    if (code !== RIGHT_BRACKET) return nok(code);
    effects.consume(code);
    effects.exit("wikilinkMarker");
    effects.exit("wikilink");
    return ok;
  }
}
