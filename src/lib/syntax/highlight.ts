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
      // Content may not be blank, nor begin or end with whitespace: Obsidian
      // highlights neither `== text==` nor `==text ==`. CommonMark attention
      // gave that for free through flanking; a forward scan has to say it.
      if (!queue.trim() || /^\s|\s$/u.test(queue)) return null;
      return queue;
    }
    queue += character;
    index++;
  }

  return null;
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
    const scan = createChunkScan(characters);
    const TEXT_TOKEN = "highlightText" as const;
    let queue = "";
    let segments: Segment[] = [];
    let index = 0;
    let remaining = 0;

    function startBody(code: Code): State | undefined {
      segments = planBody(queue);
      index = 0;
      return nextSegment(code);
    }

    function nextSegment(code: Code): State | undefined {
      const segment = segments[index];
      if (!segment) return closeStart(code);
      remaining = segment.length;
      if (segment.kind === "eol") effects.enter(types.lineEnding);
      else if (segment.kind === "data") effects.enter("data");
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
