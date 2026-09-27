import type {
  Code,
  Construct,
  Effects,
  State,
  TokenizeContext,
  Tokenizer,
} from "micromark-util-types";
import { codes } from "micromark-util-symbol";
import { math as mathExtension } from "micromark-extension-math";

const DOLLAR = codes.dollarSign;

function isDigit(code: Code): boolean {
  return code !== null && code >= codes.digit0 && code <= codes.digit9;
}

function isWhitespaceOrEof(code: Code): boolean {
  return (
    code === null ||
    code === codes.space ||
    code === codes.horizontalTab ||
    code === codes.lineFeed ||
    code === codes.carriageReturn ||
    code === codes.carriageReturnLineFeed
  );
}

/**
 * Rewindable lookahead: consume the opening `$` run and inspect what follows.
 * A single `$` directly followed by a digit is currency, not math, which is why
 * `$5 and $10` must not parse. A `$` followed by whitespace cannot open either.
 * Runs of two or more are display delimiters and keep their existing behaviour.
 */
const validOpener: Construct = {
  partial: true,
  tokenize(effects: Effects, ok: State, nok: State): State {
    let size = 0;
    return start;

    function start(code: Code): State | undefined {
      if (code !== DOLLAR) return nok(code);
      effects.enter("chunkString", { contentType: "string" });
      return sequence(code);
    }

    function sequence(code: Code): State | undefined {
      if (code === DOLLAR) {
        effects.consume(code);
        size++;
        return sequence;
      }
      effects.exit("chunkString");
      if (size > 1) return ok(code);
      if (isDigit(code) || isWhitespaceOrEof(code)) return nok(code);
      return ok(code);
    }
  },
};

/**
 * Obsidian-compatible inline math. Delegates to `micromark-extension-math`'s
 * tokenizer once the opener passes the flanking check above; that extension
 * applies no flanking rules of its own.
 */
export function mathTextSyntax(): Construct {
  const base = mathExtension({ singleDollarTextMath: true }).text?.[
    DOLLAR
  ] as Construct;

  return {
    name: "obsidianMathText",
    // Must stay upstream's guard: the delegated tokenizer asserts it again
    // internally, so relaxing it here crashes under micromark's dev build.
    previous: base.previous,
    resolve: base.resolve,
    tokenize(
      this: TokenizeContext,
      effects: Effects,
      ok: State,
      nok: State,
    ): State {
      const self = this;
      const delegate: State = (code) =>
        (base.tokenize as Tokenizer).call(self, effects, ok, nok)(code);
      return effects.check(validOpener, delegate, nok);
    },
  };
}
