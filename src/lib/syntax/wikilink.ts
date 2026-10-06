import type {
  Code,
  Construct,
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
  return (
    code === codes.lineFeed ||
    code === codes.carriageReturn ||
    code === codes.carriageReturnLineFeed
  );
}

/**
 * Lookahead for `]]`, so a single `]` can stay in the path.
 *
 * Only a doubled bracket closes a wikilink, and Obsidian reads a lone one as part
 * of the target: `[[[](u)]]` links to `[](u)`. Consuming the first `]` as a marker
 * and rejecting when the second is missing made the whole wikilink fail, and
 * CommonMark's link construct then claimed `[](u)` instead -- so we reported a link
 * to `u` where Obsidian reports a wikilink.
 *
 * It has to be a `check`: the decision needs the character *after* the bracket, and
 * by the time a tokenizer has seen it the bracket is already consumed. `check`
 * rewinds, so both branches resume on the `]` itself.
 */
const closerAhead: Construct = {
  partial: true,
  tokenize(effects: Effects, ok: State, nok: State): State {
    return first;

    function first(code: Code): State | undefined {
      if (code !== RIGHT_BRACKET) return nok(code);
      effects.enter("wikilinkCloserCheck");
      effects.consume(code);
      return second;
    }

    function second(code: Code): State | undefined {
      if (code !== RIGHT_BRACKET) return nok(code);
      effects.consume(code);
      effects.exit("wikilinkCloserCheck");
      return ok(code);
    }
  },
};

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
  let pathChars = 0;
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
    if (code === null || isLineEnding(code)) return nok(code);
    effects.enter("wikilinkPath");
    hasPath = true;
    return path(code);
  }

  function path(code: Code): State | undefined {
    if (code === BACKSLASH) {
      pathChars++;
      effects.consume(code);
      return pathEscape;
    }

    // A single `[` is a legal target character but `[[` is not, so `[[[[x]]` has a
    // path of `[x` and `![[![[x]]]]` resolves the inner embed. Rejecting here lets
    // micromark retry one position along until the path is clean.
    if (code === LEFT_BRACKET) {
      pathChars++;
      effects.consume(code);
      return pathBracket;
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
      return effects.check(closerAhead, pathCloses, pathLiteralBracket)(code);
    }

    if (code === null || isLineEnding(code)) return nok(code);

    pathChars++;
    effects.consume(code);
    return path;
  }

  /**
   * An empty target is not a link, so a `]]` reached with nothing consumed does not
   * close -- the bracket becomes content and the scan goes on. That is what makes
   * `[[]]]` a link to `]`: the first bracket is taken in, and the second and third
   * then close it. `[[]]` still rejects, because the scan runs out of line with no
   * closer left. `[[ ]]` is unaffected and stays a link with an empty path, since a
   * space is a character.
   */
  function pathCloses(code: Code): State | undefined {
    if (pathChars === 0) return pathLiteralBracket(code);
    effects.exit("wikilinkPath");
    return closeFirst(code);
  }

  /** A lone `]` belongs to the target, so it stays in the path. */
  function pathLiteralBracket(code: Code): State | undefined {
    pathChars++;
    effects.consume(code);
    return path;
  }

  function pathBracket(code: Code): State | undefined {
    if (code === LEFT_BRACKET) return nok(code);
    return path(code);
  }

  function pathEscape(code: Code): State | undefined {
    if (code === PIPE) {
      effects.exit("wikilinkPath");
      return aliasMarker(code);
    }
    // Obsidian does not let a backslash escape the closer, so `[[target\]]` is a
    // link to `target\` rather than literal text. The escape is already ignored
    // for `|` just above; this keeps `]` consistent with it and with the app.
    if (code === RIGHT_BRACKET) {
      effects.exit("wikilinkPath");
      return closeFirst(code);
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
    if (code === null || isLineEnding(code)) return nok(code);

    // Allow empty heading: [[page#]] or [[page#|alias]]
    if (code === RIGHT_BRACKET) {
      hasHeading = true;
      return closeFirst(code);
    }
    if (code === PIPE) {
      hasHeading = true;
      return aliasMarker(code);
    }

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
    if (code === RIGHT_BRACKET) {
      effects.exit("wikilinkHeading");
      return closeFirst(code);
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
