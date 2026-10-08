import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";
import { types } from "micromark-util-symbol";

import { createChunkScan, planBody, type Segment } from "./legacy-scan.js";

const TILDE = 126;

function isWhitespace(character: string): boolean {
  return character !== "" && /\s/u.test(character);
}

/**
 * Port of `remark-parse@8.0.3` `lib/tokenize/delete.js`; returns the inner slice.
 *
 * `""` is a real match and means an empty `delete`, so the result is `null` only
 * when nothing matched -- `~~~~` closes immediately and consumes all four tildes.
 * Legacy applies no `trim()` here, unlike its strong tokenizer, and that is why.
 */
export function legacyDeleteQueue(value: string): string | null {
  if (
    value.charAt(0) !== "~" ||
    value.charAt(1) !== "~" ||
    isWhitespace(value.charAt(2))
  ) {
    return null;
  }

  const length = value.length;
  let index = 1;
  let character = "";
  let previous = "";
  let preceding = "";
  let subvalue = "";

  while (++index < length) {
    character = value.charAt(index);

    if (
      character === "~" &&
      previous === "~" &&
      (!preceding || !isWhitespace(preceding))
    ) {
      return subvalue;
    }

    subvalue += previous;
    preceding = previous;
    previous = character;
  }

  return null;
}

/**
 * Obsidian's strikethrough is `remark-parse@8`'s, which closes on the first `~~`
 * it reaches and honours no escape at all:
 *
 *     ~~del\~~      a `delete` holding `del\`, where GFM reads `\~` as an escaped
 *                   tilde so the closer never forms and the run stays literal
 *     ]]~~~~        `]]`, because `~~~~` is an *empty* delete that renders as
 *                   nothing, where GFM renders four tildes
 *
 * Recorded against Obsidian 1.14.4 and confirmed by the legacy stack, which is the
 * strongest evidence available here: the two disagree about the escape *set*, so
 * agreement on the closing run is worth more than either source alone.
 *
 * Emits `strikethrough` tokens rather than its own, so
 * `mdast-util-gfm-strikethrough` builds the `delete` node with no new mdast
 * extension -- it keys on exactly those names.
 *
 * Only reachable because the chain registers `remark-gfm` *before* this package.
 * A combined micromark extension prepends its constructs, so the later extension
 * wins a shared code; with the old order GFM's strikethrough claimed every `~`
 * and this never ran.
 */
const legacyDelete: Construct = {
  name: "legacyDelete",
  tokenize(this: TokenizeContext, effects: Effects, ok: State): State {
    const characters: string[] = [];
    let queue = "";
    let remaining = 0;
    let segments: Segment[] = [];
    let index = 0;

    const scan = createChunkScan(characters);

    return start;

    function start(code: Code): State | undefined {
      characters.length = 0;
      return effects.check(scan, decide, decide)(code);
    }

    function decide(code: Code): State | undefined {
      const result = legacyDeleteQueue(characters.join(""));
      if (result === null) return literal(code);
      queue = result;
      effects.enter("strikethrough");
      effects.enter("strikethroughSequence");
      remaining = 2;
      return openSequence(code);
    }

    /**
     * No match. Emit the tilde as data rather than rejecting, for the reason
     * `legacy-emphasis.ts` gives: a `nok` hands the marker back to the stock
     * construct, which would then build strikethrough legacy never produces.
     */
    function literal(code: Code): State | undefined {
      effects.enter("data");
      effects.consume(code);
      effects.exit("data");
      return ok;
    }

    function openSequence(code: Code): State | undefined {
      effects.consume(code);
      if (--remaining > 0) return openSequence;
      effects.exit("strikethroughSequence");
      segments = planBody(queue);
      index = 0;
      return nextSegment;
    }

    function nextSegment(code: Code): State | undefined {
      const segment = segments[index];
      if (!segment) {
        effects.enter("strikethroughSequence");
        remaining = 2;
        return closeSequence(code);
      }
      remaining = segment.length;
      if (segment.kind === "eol") effects.enter(types.lineEnding);
      else if (segment.kind === "data") effects.enter("data");
      else if (segment.kind === "hardBreak") effects.enter("hardBreakEscape");
      else effects.enter("strikethroughText", { contentType: "text" });
      return consumeSegment(code);
    }

    function consumeSegment(code: Code): State | undefined {
      effects.consume(code);
      if (--remaining > 0) return consumeSegment;
      const segment = segments[index]!;
      effects.exit(
        segment.kind === "eol"
          ? types.lineEnding
          : segment.kind === "data"
            ? "data"
            : segment.kind === "hardBreak"
              ? "hardBreakEscape"
              : "strikethroughText",
      );
      index++;
      return nextSegment;
    }

    function closeSequence(code: Code): State | undefined {
      effects.consume(code);
      if (--remaining > 0) return closeSequence;
      effects.exit("strikethroughSequence");
      effects.exit("strikethrough");
      return ok;
    }
  },
};

/**
 * Replaces GFM's strikethrough with Obsidian's legacy `remark-parse@8` behaviour.
 */
export function legacyDeleteSyntax(): Extension {
  return { text: { [TILDE]: legacyDelete } };
}
