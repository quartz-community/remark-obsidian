import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";
import { createChunkScan, planBody, type Segment } from "./legacy-scan.js";
import { types } from "micromark-util-symbol";

const ASTERISK = 42;
const UNDERSCORE = 95;

/**
 * Obsidian runs stock `remark-parse@8.0.3`, whose emphasis and strong
 * tokenizers predate CommonMark's delimiter-run algorithm. They scan forward
 * character by character for a closing marker, which produces results micromark
 * cannot reach — `***a**` is `<strong>*a</strong>`, `*text**` is not emphasis at
 * all, and `***a***` nests strong outside emphasis rather than the reverse.
 *
 * The two functions below are verbatim ports of
 * `remark-parse/lib/tokenize/strong.js` and `.../emphasis.js`, reduced to the
 * non-pedantic path (Obsidian does not set `pedantic`) and returning the
 * tokenizer's `queue` instead of eating a node.
 *
 * `queue` is exactly the raw inner slice: legacy finishes with
 * `eat(subvalue + queue + subvalue)`, and `eat` asserts its argument is a prefix
 * of the remaining source. So the number of characters a match covers is always
 * `markerLength + queue.length + markerLength`, which is what lets this run
 * inside micromark's consume-once model.
 */

/**
 * Legacy's word-character test, which is ASCII and nothing else.
 *
 * `remark-parse@8` delegates this to the `is-word-character` package, and that package
 * is three lines: `/\w/` against the first character. So Cyrillic, CJK and even a
 * Latin-1 accent are all *not* word characters to it, and since this gate is the only
 * thing stopping `_` from closing inside a word, `_пристаням_стремятся` emphasises where
 * `_foo_bar` stays literal. Obsidian renders exactly that, and so does the arbiter.
 *
 * This port had `\u0080-\uFFFF` bolted onto the class, which inverted the rule for every
 * non-ASCII script -- a reasonable-looking guess at "letters" that the upstream package
 * never made. CommonMark *does* side with the guess, which is presumably where it came
 * from, but the goldens are what this is reproducing.
 */
function isWordCharacter(character: string): boolean {
  return character !== "" && /\w/u.test(character);
}

/** Port of remark-parse@8.0.3 `lib/tokenize/strong.js`; returns the inner slice. */
export function legacyStrongQueue(value: string): string | null {
  let index = 0;
  let character = value.charAt(index);

  if (
    (character !== "*" && character !== "_") ||
    value.charAt(++index) !== character
  ) {
    return null;
  }

  const marker = character;
  const length = value.length;
  index++;
  let queue = "";
  character = "";

  while (index < length) {
    character = value.charAt(index);

    if (character === marker && value.charAt(index + 1) === marker) {
      // Legacy reads two ahead but only advances one; preserved deliberately.
      character = value.charAt(index + 2);
      if (character !== marker) return queue.trim() ? queue : null;
    }

    if (character === "\\") {
      queue += character;
      character = value.charAt(++index);
    }

    queue += character;
    index++;
  }

  return null;
}

/** Port of remark-parse@8.0.3 `lib/tokenize/emphasis.js`; returns the inner slice. */
export function legacyEmphasisQueue(value: string): string | null {
  let index = 0;
  let character = value.charAt(index);

  if (character !== "*" && character !== "_") return null;

  const marker = character;
  const length = value.length;
  index++;
  let queue = "";
  character = "";
  let previous = "";

  while (index < length) {
    previous = character;
    character = value.charAt(index);

    if (character === marker) {
      character = value.charAt(++index);

      if (character !== marker) {
        if (!queue.trim() || previous === marker) return null;
        // `_` never closes inside a word.
        if (marker === "_" && isWordCharacter(character)) {
          queue += marker;
          continue;
        }
        return queue;
      }

      queue += marker;
    }

    if (character === "\\") {
      queue += character;
      character = value.charAt(++index);
    }

    queue += character;
    index++;
  }

  return null;
}

const legacyAttention: Construct = {
  name: "legacyAttention",
  tokenize(this: TokenizeContext, effects: Effects, ok: State): State {
    const characters: string[] = [];
    let name: "strong" | "emphasis" = "strong";
    let markerLength = 2;
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
      const value = characters.join("");

      // Legacy tries strong before emphasis; order is load-bearing.
      const strong = legacyStrongQueue(value);
      if (strong !== null) {
        name = "strong";
        markerLength = 2;
        queue = strong;
      } else {
        const emphasis = legacyEmphasisQueue(value);
        if (emphasis === null) return literal(code);
        name = "emphasis";
        markerLength = 1;
        queue = emphasis;
      }

      effects.enter(name);
      effects.enter(`${name}Sequence`);
      remaining = markerLength;
      return openSequence(code);
    }

    /**
     * No match. Emit the marker as plain data rather than rejecting: a `nok`
     * here would hand the marker back to micromark's core attention resolver,
     * which would then build emphasis legacy never produces.
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
      effects.exit(`${name}Sequence`);
      segments = planBody(queue);
      index = 0;
      return nextSegment;
    }

    function nextSegment(code: Code): State | undefined {
      const segment = segments[index];
      if (!segment) {
        effects.enter(`${name}Sequence`);
        remaining = markerLength;
        return closeSequence(code);
      }
      remaining = segment.length;
      if (segment.kind === "eol") effects.enter(types.lineEnding);
      else if (segment.kind === "data") effects.enter("data");
      else if (segment.kind === "hardBreak") effects.enter("hardBreakEscape");
      else effects.enter(`${name}Text`, { contentType: "text" });
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
              : `${name}Text`,
      );
      index++;
      return nextSegment;
    }

    function closeSequence(code: Code): State | undefined {
      effects.consume(code);
      if (--remaining > 0) return closeSequence;
      effects.exit(`${name}Sequence`);
      effects.exit(name);
      return ok;
    }
  },
};

/**
 * Replaces micromark's CommonMark attention with Obsidian's legacy
 * `remark-parse@8` behaviour.
 */
export function legacyEmphasisSyntax(): Extension {
  return {
    text: {
      [ASTERISK]: legacyAttention,
      [UNDERSCORE]: legacyAttention,
    },
  };
}
