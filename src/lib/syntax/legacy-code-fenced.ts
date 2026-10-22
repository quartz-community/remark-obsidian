import { codeFenced } from "micromark-core-commonmark";
import { codes } from "micromark-util-symbol";
import type {
  Code,
  Construct,
  ConstructRecord,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";
import { enterFence, exitFence, isQuoteLazyLine } from "./quote-fence-state.js";

/**
 * The closing fence, DECLINED on a line the quote did not carry.
 *
 * Measured against live 1.15.0: a fence opened inside a blockquote runs to the QUOTED closer,
 * and a closer on a line without the `>` is not a closer at all -- it is content.
 *
 *     > ``` / > a / > [^a]: def / ```        the unquoted ``` is CONTENT; no def for the next
 *     > ``` / > a / > ```                    the quoted closer ends the block
 *
 * Ours took the unquoted line as the closer, which ended the block early and let everything
 * after it parse as ordinary flow -- a definition we then reported that Obsidian does not have.
 *
 * `codeFenced` reaches its closer through `effects.attempt(closeStart, ...)`, and that is its
 * ONLY `attempt`, so wrapping `attempt` reaches exactly the closing fence and nothing else.
 *
 * The candidate line is `line + 1`, not `line`: `atNonLazyBreak` hands `attempt` the line ending
 * that PRECEDES the candidate closer, and `closeStart` consumes that ending itself.
 */
function onlyQuotedCloser(
  construct: Construct | Construct[] | ConstructRecord,
): Construct | Construct[] | ConstructRecord {
  if (Array.isArray(construct) || typeof construct.tokenize !== "function") {
    return construct;
  }
  const inner = construct as Construct;
  return {
    partial: true,
    tokenize: function tokenizeOnlyQuotedCloser(
      this: TokenizeContext,
      effects: Effects,
      ok: State,
      nok: State,
    ): State {
      const self = this;
      return function start(code: Code): State | undefined {
        if (isQuoteLazyLine(self.parser, self.now().line + 1)) return nok(code);
        return inner.tokenize.call(self, effects, ok, nok)(code);
      };
    },
  };
}

/**
 * Obsidian's fenced code, which differs from stock in ONE respect: a quoted fence is closed only
 * by a quoted closer.
 *
 * The other half of the rule -- that a line omitting the `>` does not END the block -- is
 * enforced in `legacy-block-quote.ts` instead, by the quote ABSORBING that line. Enforcing it
 * here, by tolerating lazy lines in the fence's continuation, reaches list items too and cost
 * 114 documents to gain 33; scoping that to quotes still cost 31 to gain 14, because a quote
 * closed by a blank line takes its fence with it however tolerant the fence is. Absorbing in the
 * quote fixes both at once and leaves stock's lazy handling untouched.
 *
 * BORROWED, NOT COPIED. `codeFenced` is ~300 lines of fence-length, info-string and
 * closing-fence bookkeeping, none of which changes. Its `tokenize` is called with the `effects`
 * WE build, so substituting one call needs no fork.
 *
 * Registered as `legacyCodeFenced`, NOT `codeFenced`: `disable` matches on NAME, so sharing the
 * stock name would switch off both and leave no fence construct at all.
 */
const legacyCodeFenced: Construct = {
  concrete: true,
  name: "legacyCodeFenced",
  tokenize: function tokenizeLegacyCodeFenced(
    this: TokenizeContext,
    effects: Effects,
    ok: State,
    nok: State,
  ): State {
    const self = this;
    const patched: Effects = {
      ...effects,
      attempt: (
        construct: Construct | Construct[] | ConstructRecord,
        onOk: State,
        onNok?: State,
      ): State => effects.attempt(onlyQuotedCloser(construct), onOk, onNok),
    };
    // Published for the quote, which has to know a fence is open to decide whether to absorb an
    // unquoted or blank line rather than close.
    enterFence(self.parser);
    const settled =
      (next: State): State =>
      (code: Code): State | undefined => {
        exitFence(self.parser);
        return next(code);
      };
    return codeFenced.tokenize.call(this, patched, settled(ok), settled(nok));
  },
};

/**
 * Pushed, not substituted for stock: micromark tries the constructs for a code in order and an
 * extension's come first, so this one opens every fence and stock's is the fallback if it ever
 * declines.
 */
export function legacyCodeFencedSyntax(): Extension {
  return {
    flow: {
      [codes.graveAccent]: [legacyCodeFenced],
      [codes.tilde]: [legacyCodeFenced],
    },
  };
}
