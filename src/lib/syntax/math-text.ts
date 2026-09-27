/**
 * Obsidian-compatible inline math.
 *
 * Adapted from `micromark-extension-math` (MIT), Copyright (c) 2020 Titus Wormer
 * <tituswormer@gmail.com>. See LICENSE-THIRD-PARTY.md.
 *
 * Vendored rather than wrapped. Two of Obsidian's three divergences live inside
 * the tokenizer's state machine, and the upstream tokenizer asserts its own
 * `previous` guard internally, so it cannot be gated from outside. Upstream fixes
 * are also unwanted by definition: this file reproduces Obsidian, which upstream
 * rightly does not.
 *
 * Token names are deliberately unchanged so `mdast-util-math` keeps mapping them.
 *
 * Divergences, each pinned by a case in the parity corpus:
 *
 *  1. A lone `$` followed by a digit or whitespace does not open, so `$5 and $10`
 *     is currency. Upstream applies no flanking rules at all.
 *  2. A backslash escapes the closing delimiter, so `$x^2\$` is not math. Obsidian
 *     honours the escape for math while ignoring it for wikilinks, embeds,
 *     highlights and comments.
 *  3. A closing run consumes only as many markers as the opener used, leaving the
 *     rest as literal text, so `$x^2$$` is math followed by `$`. Upstream requires
 *     the runs to be equal and otherwise produces no math.
 */

import type {
  Code,
  Construct,
  Effects,
  Event,
  State,
  Token,
  TokenizeContext,
} from "micromark-util-types";
import { codes, types } from "micromark-util-symbol";

const DOLLAR = codes.dollarSign;
const BACKSLASH = codes.backslash;

function isDigit(code: Code): boolean {
  return code !== null && code >= codes.digit0 && code <= codes.digit9;
}

function isLineEnding(code: Code): boolean {
  return (
    code === codes.lineFeed ||
    code === codes.carriageReturn ||
    code === codes.carriageReturnLineFeed
  );
}

function isWhitespaceOrEof(code: Code): boolean {
  return (
    code === null ||
    code === codes.space ||
    code === codes.horizontalTab ||
    isLineEnding(code)
  );
}

export function mathTextSyntax(): Construct {
  return {
    name: "obsidianMathText",
    tokenize: tokenizeMathText,
    resolve: resolveMathText,
    previous: previousMathText,
  };
}

/**
 * Upstream refuses to start when the preceding character is `$`, which stops an
 * opening run longer than its closer from pairing at all. Obsidian retries with a
 * shorter opener, so `$$x^2$` is a literal `$` followed by inline math.
 *
 * Relaxing that is safe for this tokenizer alone, but not when stock `remark-math`
 * is co-registered for `$`: micromark still attempts its tokenizer, whose internal
 * `assert(previous.call(...))` then fires on a state we legitimately created. So the
 * guard adapts to what is actually registered, checked here rather than at plugin
 * setup because extensions are only merged by tokenize time — and because this
 * package initialises before a consumer's math plugin does.
 */
function previousMathText(this: TokenizeContext, code: Code): boolean {
  if (code !== DOLLAR) return true;
  if (!hasUpstreamMathText(this)) return true;
  return (
    this.events[this.events.length - 1]?.[1].type === types.characterEscape
  );
}

function hasUpstreamMathText(context: TokenizeContext): boolean {
  const registered = context.parser.constructs.text?.[DOLLAR];
  const list = Array.isArray(registered) ? registered : [registered];
  return list.some((construct) => construct?.name === "mathText");
}

function tokenizeMathText(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  let sizeOpen = 0;
  let sizeClose = 0;
  let token: Token;

  return start;

  function start(code: Code): State | undefined {
    if (code !== DOLLAR) return nok(code);
    effects.enter("mathText");
    effects.enter("mathTextSequence");
    return sequenceOpen(code);
  }

  function sequenceOpen(code: Code): State | undefined {
    if (code === DOLLAR) {
      effects.consume(code);
      sizeOpen++;
      return sequenceOpen;
    }

    if (sizeOpen === 1 && (isDigit(code) || isWhitespaceOrEof(code))) {
      return nok(code);
    }

    effects.exit("mathTextSequence");
    return between(code);
  }

  function between(code: Code): State | undefined {
    if (code === null) return nok(code);

    if (code === DOLLAR) {
      token = effects.enter("mathTextSequence");
      sizeClose = 0;
      return sequenceClose(code);
    }

    if (code === codes.space) {
      effects.enter("space");
      effects.consume(code);
      effects.exit("space");
      return between;
    }

    if (isLineEnding(code)) {
      effects.enter(types.lineEnding);
      effects.consume(code);
      effects.exit(types.lineEnding);
      return between;
    }

    effects.enter("mathTextData");
    return data(code);
  }

  function data(code: Code): State | undefined {
    if (code === BACKSLASH) {
      effects.consume(code);
      return dataEscaped;
    }

    if (
      code === null ||
      code === codes.space ||
      code === DOLLAR ||
      isLineEnding(code)
    ) {
      effects.exit("mathTextData");
      return between(code);
    }

    effects.consume(code);
    return data;
  }

  function dataEscaped(code: Code): State | undefined {
    if (code === null || isLineEnding(code)) {
      effects.exit("mathTextData");
      return between(code);
    }
    effects.consume(code);
    return data;
  }

  function sequenceClose(code: Code): State | undefined {
    if (code === DOLLAR && sizeClose < sizeOpen) {
      effects.consume(code);
      sizeClose++;
      return sequenceClose;
    }

    if (sizeClose === sizeOpen) {
      effects.exit("mathTextSequence");
      effects.exit("mathText");
      return ok(code);
    }

    token.type = "mathTextData";
    return data(code);
  }
}

/**
 * Upstream's resolver, unchanged: strips one layer of padding when the span both
 * opens and closes with whitespace, then merges adjacent space and data events.
 */
function resolveMathText(events: Event[]): Event[] {
  let tailExitIndex = events.length - 4;
  let headEnterIndex = 3;
  let index: number;
  let enter: number | undefined;

  if (
    (events[headEnterIndex]?.[1].type === types.lineEnding ||
      events[headEnterIndex]?.[1].type === "space") &&
    (events[tailExitIndex]?.[1].type === types.lineEnding ||
      events[tailExitIndex]?.[1].type === "space")
  ) {
    index = headEnterIndex;

    while (++index < tailExitIndex) {
      if (events[index]?.[1].type === "mathTextData") {
        events[tailExitIndex]![1].type = "mathTextPadding";
        events[headEnterIndex]![1].type = "mathTextPadding";
        headEnterIndex += 2;
        tailExitIndex -= 2;
        break;
      }
    }
  }

  index = headEnterIndex - 1;
  tailExitIndex++;

  while (++index <= tailExitIndex) {
    if (enter === undefined) {
      if (
        index !== tailExitIndex &&
        events[index]?.[1].type !== types.lineEnding
      ) {
        enter = index;
      }
    } else if (
      index === tailExitIndex ||
      events[index]?.[1].type === types.lineEnding
    ) {
      events[enter]![1].type = "mathTextData";

      if (index !== enter + 2) {
        events[enter]![1].end = events[index - 1]![1].end;
        events.splice(enter + 2, index - enter - 2);
        tailExitIndex -= index - enter - 2;
        index = enter + 2;
      }

      enter = undefined;
    }
  }

  return events;
}
