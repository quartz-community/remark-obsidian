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

const EQUALS = 61;
const MARKER = "=";
const MARKER_LENGTH = 2;

/**
 * `==highlight==` as Obsidian tokenizes it, which is a forward scan rather than
 * CommonMark attention.
 *
 * The algorithm is `remark-parse@8`'s `strong.js` without its
 * `charAt(index + 2) !== marker` guard: close at the first `==`, and fail the
 * whole attempt when the content would be empty. That failure is what makes an
 * over-long run behave — in `====text==` the attempt at the first `=` dies on
 * empty content, so the retry one character along leaves a literal `=` and
 * highlights `=text`, which is what Obsidian shows.
 *
 * Scanning raw codes also makes backslashes fall out without special handling.
 * `==text\==` closes on the escaped run and keeps `text\` as content, because
 * the scan never consults CommonMark's escape rules; `\==text==` never opens,
 * because micromark's own escape consumes that `=` before this construct is
 * tried; and `\==text\==` produces no highlight for the same reason. All three
 * match Obsidian, and the asymmetry between them needs no code of its own.
 */
export function legacyHighlightQueue(value: string): string | null {
  if (value.charAt(0) !== MARKER || value.charAt(1) !== MARKER) return null;

  let index = MARKER_LENGTH;
  let queue = "";

  while (index < value.length) {
    const character = value.charAt(index);
    if (character === MARKER && value.charAt(index + 1) === MARKER) {
      // Content may not be blank or begin with whitespace, and no later closer
      // can repair either, so the attempt is over.
      if (!queue.trim() || /^\s/u.test(queue)) return null;
      // Trailing whitespace is different: the scan keeps going and may close
      // further along. `===` / `[^2]: b` / `===` closes on the *last* two
      // markers, because stopping at the first leaves `=⏎[^2]: b⏎` ending in a
      // newline — carrying on takes the next `=` into the content and lands on
      // a closer that does not.
      if (!/\s$/u.test(queue)) return queue;
    }
    queue += character;
    index++;
  }

  return null;
}

/**
 * Stop the chunk scan once `legacyHighlightQueue` is bound to answer `null`.
 *
 * The scan materialises the rest of the text chunk so the ported tokenizer can
 * judge the whole match, and that is what made a run of `=` quadratic: every one
 * of 20000 openers read to end of input before the decision function ran, even
 * though the decision itself needs four characters. `=` x20000 was 26ms on the
 * bare chain against more than 20s here.
 *
 * Only the two conditions that `legacyHighlightQueue` itself treats as final are
 * short-circuited, so this cannot change an answer -- it only stops collecting
 * characters the answer no longer depends on:
 *
 *   - content beginning with whitespace never matches, whatever follows, because
 *     the first closer tests `/^\s/` on the whole queue and every later one sees
 *     the same prefix;
 *   - a closer immediately after the opener has empty content, and `====` is the
 *     case the construct's own docstring is built on.
 *
 * `\s` is kept rather than written out as ASCII whitespace, deliberately: the
 * decision function uses `/^\s/u`, which includes U+00A0, and a narrower class
 * here would stop the scan on inputs it still accepts.
 */
function createQueueBound(): (character: string) => boolean {
  let index = -1;
  let opened = false;
  return (character: string): boolean => {
    index += 1;
    if (index < MARKER_LENGTH) return character !== MARKER;
    if (index === MARKER_LENGTH) {
      opened = character === MARKER;
      return /^\s/u.test(character);
    }
    // The second half of a closer sitting directly on the opener: empty content.
    return index === MARKER_LENGTH + 1 && opened && character === MARKER;
  };
}

const highlight: Construct = {
  name: "highlight",
  tokenize(
    this: TokenizeContext,
    effects: Effects,
    ok: State,
    nok: State,
  ): State {
    const characters: string[] = [];
    const scan = createChunkScan(characters, createQueueBound());
    const TEXT_TOKEN = "highlightText" as const;
    let queue = "";
    let segments: Segment[] = [];
    let index = 0;
    let remaining = 0;

    function startBody(code: Code): State | undefined {
      segments = planBody(queue, { stripContinuationIndent: true });
      index = 0;
      return nextSegment(code);
    }

    function nextSegment(code: Code): State | undefined {
      const segment = segments[index];
      if (!segment) return closeStart(code);
      remaining = segment.length;
      if (segment.kind === "eol") effects.enter(types.lineEnding);
      else if (segment.kind === "data") effects.enter("data");
      else if (segment.kind === "prefix") effects.enter(types.linePrefix);
      else if (segment.kind === "hardBreak") effects.enter("hardBreakEscape");
      else effects.enter(TEXT_TOKEN, { contentType: "text" });
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
            : segment.kind === "prefix"
              ? types.linePrefix
              : segment.kind === "hardBreak"
                ? "hardBreakEscape"
                : TEXT_TOKEN,
      );
      index++;
      return nextSegment;
    }

    return start;

    function start(code: Code): State | undefined {
      if (code !== EQUALS) return nok(code);
      characters.length = 0;
      return effects.check(scan, decide, decide)(code);
    }

    function decide(code: Code): State | undefined {
      const found = legacyHighlightQueue(characters.join(""));
      if (found === null) return nok(code);

      queue = found;
      effects.enter("highlight");
      effects.enter("highlightSequence");
      remaining = MARKER_LENGTH;
      return openSequence(code);
    }

    function openSequence(code: Code): State | undefined {
      effects.consume(code);
      if (--remaining > 0) return openSequence;
      effects.exit("highlightSequence");
      return startBody;
    }

    function closeStart(code: Code): State | undefined {
      effects.enter("highlightSequence");
      remaining = MARKER_LENGTH;
      return closeSequence(code);
    }

    function closeSequence(code: Code): State | undefined {
      effects.consume(code);
      if (--remaining > 0) return closeSequence;
      effects.exit("highlightSequence");
      effects.exit("highlight");
      return ok;
    }
  },
};

export function highlightSyntax(): Extension {
  return { text: { [EQUALS]: highlight } };
}
