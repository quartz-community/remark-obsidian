import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
} from "micromark-util-types";
import { characterEntitiesLegacy } from "character-entities-legacy";

const AMPERSAND = 38;
const HASH = 35;
const SEMICOLON = 59;

/** The longest name in the table, which is what bounds the scan. */
const LEGACY = new Set<string>(characterEntitiesLegacy);
const MAX_NAME = Math.max(...[...LEGACY].map((name) => name.length));

/** Numeric references are bounded by what a code point can be written as. */
const MAX_BODY = Math.max(MAX_NAME, 10);

const isAlphanumeric = (code: Code): boolean =>
  code !== null &&
  ((code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122));

/**
 * The longest prefix of `body` that HTML resolves without a semicolon.
 *
 * Greedy, which is the whole point: `&notreal` is `¬real` because `not` is in the
 * table and `notreal` is not, so the match stops at three characters and the rest
 * stays text.
 */
function longestLegacy(body: string): string | undefined {
  for (let length = Math.min(body.length, MAX_NAME); length > 0; length--) {
    const name = body.slice(0, length);
    if (LEGACY.has(name)) return name;
  }
  return undefined;
}

/** A numeric body, with the radix its prefix implies. */
function numeric(body: string): { digits: string; hex: boolean } | undefined {
  if (!body.startsWith("#")) return undefined;
  const hex = body.length > 1 && (body[1] === "x" || body[1] === "X");
  const digits = body.slice(hex ? 2 : 1);
  const pattern = hex ? /^[\dA-Fa-f]+$/u : /^\d+$/u;
  if (digits === "" || !pattern.test(digits)) return undefined;
  return { digits, hex };
}

/**
 * Read the reference body without committing to it, bounded by the table.
 *
 * `createChunkScan` in `legacy-scan.ts` reads to end of file, which is affordable
 * for a construct on `*` but not here -- `&` is common enough in prose that a
 * scan-to-EOF per occurrence is the quadratic blowup already recorded for
 * `highlight-run`. The longest name in the table is the natural bound.
 */
function createBodyScan(body: string[]): Construct {
  return {
    partial: true,
    tokenize(effects: Effects, ok: State): State {
      return start;

      function start(code: Code): State | undefined {
        effects.enter("legacyChunkScan");
        effects.consume(code);
        return inside;
      }

      function inside(code: Code): State | undefined {
        const first = body.length === 0;
        const taking =
          body.length < MAX_BODY &&
          (isAlphanumeric(code) || (first && code === HASH));
        if (!taking || code === null) {
          // A terminator is recorded so the decision can defer to the stock
          // construct, which already handles a reference written in full.
          if (code === SEMICOLON) body.push(";");
          effects.exit("legacyChunkScan");
          return ok(code);
        }
        body.push(String.fromCodePoint(code));
        effects.consume(code);
        return inside;
      }
    },
  };
}

/**
 * Obsidian resolves a character reference with no semicolon, as HTML does.
 *
 * CommonMark requires the terminator, so micromark leaves `&amp` as four characters
 * where Obsidian renders `&`. The rule is HTML's historical one and the legacy stack
 * agrees with the app on all of it: the named references in HTML's legacy table
 * resolve bare and match greedily, numeric references resolve bare too, and anything
 * outside the table stays literal.
 *
 *     &amp        &          &notreal      ¬real     &nosuchthing   literal
 *     &copy       ©          &ampx         &x        &;             literal
 *     &#35        #          &AMP          &         `&amp`         literal
 *
 * Only the bare form is handled here. A reference written with its semicolon is left
 * to micromark's own construct, which is why this rejects when it sees one -- the
 * inverse of that split silently restored CommonMark's behaviour when I tried it for
 * escapes, since a `nok` falls through to stock rather than suppressing it.
 */
const legacyCharacterReference: Construct = {
  name: "legacyCharacterReference",
  tokenize(effects: Effects, ok: State, nok: State): State {
    const body: string[] = [];
    let remaining = 0;
    let hexadecimal = false;
    let isNumeric = false;
    /** Whether the reference carries its terminator, which is ours to consume too. */
    let semicolon = false;

    const scan = createBodyScan(body);

    return start;

    function start(code: Code): State | undefined {
      body.length = 0;
      return effects.check(scan, decide, decide)(code);
    }

    function decide(code: Code): State | undefined {
      const written = body.join("");
      // Written in full, so it is micromark's to claim -- unless micromark will not
      // claim it. Its numeric reference caps the digits at seven for decimal and six
      // for hexadecimal, so `&#87654321;` is refused outright and stays literal, where
      // Obsidian decodes it to U+FFFD like any other out-of-range code point. Note the
      // cap is on *digits* and not on the value: `&#0;`, `&#1114111;` and `&#x110000;`
      // are all within it and all already give U+FFFD, which is what made this look
      // like a value rule until the digit counts were compared.
      if (written.endsWith(";")) {
        const inside = numeric(written.slice(0, -1));
        if (!inside) return nok(code);
        if (inside.digits.length <= (inside.hex ? 6 : 7)) return nok(code);
        semicolon = true;
        isNumeric = true;
        hexadecimal = inside.hex;
        remaining = inside.digits.length;
        effects.enter("characterReference");
        effects.enter("characterReferenceMarker");
        effects.consume(code);
        effects.exit("characterReferenceMarker");
        return numericMarker;
      }

      const asNumber = numeric(written);
      if (asNumber) {
        isNumeric = true;
        hexadecimal = asNumber.hex;
        remaining = asNumber.digits.length;
      } else {
        const name = longestLegacy(written);
        if (name === undefined) return nok(code);
        isNumeric = false;
        remaining = name.length;
      }

      effects.enter("characterReference");
      effects.enter("characterReferenceMarker");
      effects.consume(code);
      effects.exit("characterReferenceMarker");
      return isNumeric ? numericMarker : beforeValue;
    }

    /**
     * The `#`, and `x` when present, carry the radix: `from-markdown` reads the
     * marker's own type to decide how to decode the digits.
     */
    function numericMarker(code: Code): State | undefined {
      effects.enter(
        hexadecimal
          ? "characterReferenceMarkerHexadecimal"
          : "characterReferenceMarkerNumeric",
      );
      effects.consume(code);
      return hexadecimal ? radixLetter : afterNumericMarker;
    }

    function radixLetter(code: Code): State | undefined {
      effects.consume(code);
      return afterNumericMarker;
    }

    function afterNumericMarker(code: Code): State | undefined {
      effects.exit(
        hexadecimal
          ? "characterReferenceMarkerHexadecimal"
          : "characterReferenceMarkerNumeric",
      );
      return beforeValue(code);
    }

    function beforeValue(code: Code): State | undefined {
      effects.enter("characterReferenceValue");
      return value(code);
    }

    function value(code: Code): State | undefined {
      effects.consume(code);
      if (--remaining > 0) return value;
      effects.exit("characterReferenceValue");
      if (!semicolon) {
        effects.exit("characterReference");
        return ok;
      }
      // The terminator is a second `characterReferenceMarker`, which is how
      // micromark's own full-reference form spells it.
      effects.enter("characterReferenceMarker");
      return terminator;
    }

    function terminator(code: Code): State | undefined {
      effects.consume(code);
      effects.exit("characterReferenceMarker");
      effects.exit("characterReference");
      return ok;
    }
  },
};

/**
 * Adds the semicolon-less form of a character reference, leaving the complete form
 * to micromark.
 */
export function legacyEntitySyntax(): Extension {
  return { text: { [AMPERSAND]: legacyCharacterReference } };
}
