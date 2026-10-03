import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";

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

function isWordCharacter(character: string): boolean {
  return character !== "" && /[\dA-Za-z_\u0080-\uFFFF]/.test(character);
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

/** Materialise a micromark code as the source character legacy would have seen. */
function codeToCharacter(code: Code): string {
  if (code === -5 || code === -4 || code === -3) return "\n";
  if (code === -2) return "\t";
  if (code === -1) return " ";
  return String.fromCodePoint(code as number);
}

const legacyAttention: Construct = {
  name: "legacyAttention",
  tokenize(this: TokenizeContext, effects: Effects, ok: State): State {
    let characters: string[] = [];
    let name: "strong" | "emphasis" = "strong";
    let markerLength = 2;
    let queue = "";
    let remaining = 0;
    let trailing = 0;

    /**
     * Materialises the rest of the text chunk so the ported tokenizers can run
     * on a plain string. `check` rewinds afterwards, so nothing is really eaten.
     * The consumes must sit inside an open token or micromark's token stack
     * desynchronises on restore.
     */
    const scan: Construct = {
      partial: true,
      tokenize(scanEffects, scanOk) {
        return function enter(code: Code): State | undefined {
          scanEffects.enter("legacyAttentionScan");
          return step(code);
        };

        function step(code: Code): State | undefined {
          if (code === null) {
            scanEffects.exit("legacyAttentionScan");
            return scanOk(code);
          }
          characters.push(codeToCharacter(code));
          scanEffects.consume(code);
          return step;
        }
      },
    };

    return start;

    function start(code: Code): State | undefined {
      characters = [];
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

      // A `text` chunk ending in whitespace loses it: micromark reads a trailing
      // run as a line suffix and drops it. CommonMark emphasis can never end in
      // whitespace, so core attention never hits this, but legacy emphasis does —
      // `a* b *c` holds ` b `. Consume that run as data inside the span instead.
      trailing = queue.length - queue.replace(/\s+$/u, "").length;

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
      effects.enter(`${name}Text`, { contentType: "text" });
      remaining = queue.length - trailing;
      return body;
    }

    function body(code: Code): State | undefined {
      effects.consume(code);
      if (--remaining > 0) return body;
      effects.exit(`${name}Text`);
      if (trailing > 0) {
        effects.enter("data");
        remaining = trailing;
        return trailingWhitespace;
      }
      effects.enter(`${name}Sequence`);
      remaining = markerLength;
      return closeSequence;
    }

    function trailingWhitespace(code: Code): State | undefined {
      effects.consume(code);
      if (--remaining > 0) return trailingWhitespace;
      effects.exit("data");
      effects.enter(`${name}Sequence`);
      remaining = markerLength;
      return closeSequence;
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
