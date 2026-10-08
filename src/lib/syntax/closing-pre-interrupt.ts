import { htmlFlow } from "micromark-core-commonmark";
import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";

const LESS_THAN = 60;
const SLASH = 47;
const GREATER_THAN = 62;
const SPACE = 32;
const TAB = -2;
const LINE_FEED = -4;
const CARRIAGE_RETURN = -3;
const CARRIAGE_RETURN_LINE_FEED = -5;

/** `pre`, in the order the scan needs it, case-insensitive. */
const NAME = [112, 114, 101];

function isLineEnding(code: Code): boolean {
  return (
    code === LINE_FEED ||
    code === CARRIAGE_RETURN ||
    code === CARRIAGE_RETURN_LINE_FEED
  );
}

/** Whatever may legally follow a tag name: whitespace, `/`, `>`, or the line's end. */
function isAfterName(code: Code): boolean {
  return (
    code === null ||
    isLineEnding(code) ||
    code === SPACE ||
    code === TAB ||
    code === SLASH ||
    code === GREATER_THAN
  );
}

/** Rewindable lookahead for `</pre` followed by a legal tag-name terminator. */
const closingPre: Construct = {
  partial: true,
  tokenize(effects, ok, nok) {
    let at = 0;
    return start;

    function start(code: Code): State | undefined {
      if (code !== LESS_THAN) return nok(code);
      effects.enter("chunkString", { contentType: "string" });
      effects.consume(code);
      return slash;
    }

    function slash(code: Code): State | undefined {
      if (code !== SLASH) return nok(code);
      effects.consume(code);
      return name;
    }

    function name(code: Code): State | undefined {
      if (typeof code !== "number" || code < 0) return nok(code);
      // Lowercase the ASCII letter rather than branching on both cases.
      if ((code | 0x20) !== NAME[at]) return nok(code);
      effects.consume(code);
      at += 1;
      return at === NAME.length ? after : name;
    }

    function after(code: Code): State | undefined {
      if (!isAfterName(code)) return nok(code);
      effects.exit("chunkString");
      return ok(code);
    }
  },
};

/**
 * A closing `</pre>` interrupts a paragraph; a closing `</script>` does not.
 *
 * micromark splits html blocks by tag name across two shared lists. `pre` sits in
 * `htmlRawNames`, which only governs *opening* tags, and is absent from
 * `htmlBlockNames`, so a bare `</pre>` is neither type 1 nor type 6 and lands on
 * type 7 -- which refuses outright when interrupting
 * (`html-flow.js`, `self.interrupt && !lazy ? nok`). Obsidian's fork of
 * remark-parse@8 carries `pre` in its block-tag list, so there the closer is an
 * ordinary block that interrupts.
 *
 * The arbiter pins the rule tighter than the mechanism suggests, and the narrower
 * reading is the correct one: of the four raw names, only `</pre>` interrupts.
 * `</script>`, `</style>` and `</textarea>` all stay absorbed into the paragraph.
 * Generalising to the raw list would have broken six recorded cases that match today.
 *
 * Two things keep this surgical. It engages **only** when `self.interrupt` is set,
 * so every non-interrupting `</pre>` is tokenized by stock micromark, bit for bit.
 * And once engaged it delegates to stock `htmlFlow` with the refusal suppressed
 * rather than reimplementing type 6 -- so attribute scanning and the blank-line
 * continuation stay micromark's, and the block still absorbs the rest of its line
 * (in the recorded case, the `</td></tr></table>` that follows).
 *
 * The shared lists are module exports with nothing to override, which is why this is
 * a prepended construct and not configuration.
 */
export function closingPreInterruptSyntax(): Extension {
  return {
    flow: {
      [LESS_THAN]: {
        name: "closingPreInterrupt",
        tokenize: tokenizeClosingPreInterrupt,
        concrete: true,
      },
    },
  };
}

function tokenizeClosingPreInterrupt(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;
  return start;

  function start(code: Code): State | undefined {
    // Not interrupting: stock htmlFlow already produces the right block, so stay
    // out of the way entirely rather than racing it with a duplicate.
    if (!self.interrupt) return nok(code);
    if (code !== LESS_THAN) return nok(code);
    return effects.check(closingPre, delegate, nok)(code);
  }

  function delegate(code: Code): State | undefined {
    const saved = self.interrupt;
    self.interrupt = undefined;
    const restore =
      (next: State): State =>
      (restoreCode: Code) => {
        self.interrupt = saved;
        return next(restoreCode);
      };
    return htmlFlow.tokenize.call(
      self,
      effects,
      restore(ok),
      restore(nok),
    )(code);
  }
}
