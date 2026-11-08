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

  while (index < value.length) {
    if (value.charAt(index) === MARKER && value.charAt(index + 1) === MARKER) {
      // Content may not be blank or begin with whitespace, and no later closer
      // can repair either, so the attempt is over. Blank content that is not
      // empty begins with whitespace, so the first character decides both.
      if (index === MARKER_LENGTH || isSpace(value.charAt(MARKER_LENGTH)))
        return null;
      // Trailing whitespace is different: the scan keeps going and may close
      // further along. `===` / `[^2]: b` / `===` closes on the *last* two
      // markers, because stopping at the first leaves `=⏎[^2]: b⏎` ending in a
      // newline — carrying on takes the next `=` into the content and lands on
      // a closer that does not.
      if (!isSpace(value.charAt(index - 1)))
        return value.slice(MARKER_LENGTH, index);
    }
    index++;
  }

  return null;
}

/**
 * One character each, not the content so far: with a `==` after every whitespace, testing the
 * growing content at each one was quadratic per opener. `\s` is `trim`'s own class.
 */
function isSpace(character: string): boolean {
  return /\s/u.test(character);
}

/**
 * Per text run, the offset from which no opener can close.
 *
 * `legacyHighlightQueue` closes on a `==` with no whitespace straight before it, which is a fact
 * about that `==` and not about the opener. So once a scan that read to the end of the run answers
 * `null`, every later opener in the run must too, and need not read it again. `==a ` x8000 scanned
 * to the end for each of its 8000 openers. A tokenizer reads one run, so it keys the memo.
 */
const noCloserFrom = new WeakMap<TokenizeContext, number>();

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
  let previous = "";
  let beforePrevious = "";
  return (character: string): boolean => {
    index += 1;
    const last = previous;
    const beforeLast = beforePrevious;
    beforePrevious = previous;
    previous = character;
    if (index < MARKER_LENGTH) return character !== MARKER;
    if (index === MARKER_LENGTH) {
      opened = character === MARKER;
      return /^\s/u.test(character);
    }
    // The second half of a closer sitting directly on the opener: empty content.
    if (index === MARKER_LENGTH + 1) return opened && character === MARKER;
    // The first closer `legacyHighlightQueue` accepts: two markers with no whitespace before
    // them. It answers there, so nothing after it is needed. Without this every highlight read
    // to the end of the run, and `==a== ` x4000 took over 10 s under `strict`.
    return (
      character === MARKER &&
      last === MARKER &&
      index >= MARKER_LENGTH + 2 &&
      !/\s/u.test(beforeLast)
    );
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
    const self = this;
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
      const known = noCloserFrom.get(self);
      if (known !== undefined && self.now().offset >= known) return nok(code);
      characters.length = 0;
      return effects.check(scan, decide, decide)(code);
    }

    function decide(code: Code): State | undefined {
      const found = legacyHighlightQueue(characters.join(""));
      if (found === null) {
        // Past the `createQueueBound` stops, so this scan did read to the end of the run.
        if (characters.length > MARKER_LENGTH + 2)
          noCloserFrom.set(self, self.now().offset);
        return nok(code);
      }
      if (emphasisClosesInside(self, found)) return nok(code);

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

type Group = 1 | 2 | undefined;

/** micromark's `classifyCharacter`: whitespace 1, punctuation 2, anything else neither. */
function group(character: string | undefined): Group {
  if (character === undefined || /\s/u.test(character)) return 1;
  if (/\p{P}|\p{S}/u.test(character)) return 2;
  return undefined;
}

/**
 * Each text's emphasis runs paired so far, as `emphasisClosesInside` last left them, so that a
 * line of highlights reads its events once rather than once per `==`.
 */
const pairedRuns = new WeakMap<
  TokenizeContext,
  {
    readonly events: TokenizeContext["events"];
    read: number;
    last: TokenizeContext["events"][number] | undefined;
    readonly stack: Array<{ run: Run; outer: boolean }>;
  }
>();

interface Run {
  readonly marker: string;
  size: number;
  readonly open: boolean;
  readonly close: boolean;
}

/** micromark's own flanking rule for an attention run (`attention.js`). */
function flank(marker: string, size: number, before: Group, after: Group): Run {
  const open = !after || (after === 2 && Boolean(before));
  const close = !before || (before === 2 && Boolean(after));
  return {
    marker,
    size,
    open: marker === "*" ? open : open && (Boolean(before) || !close),
    close: marker === "*" ? close : close && (Boolean(after) || !open),
  };
}

/**
 * Whether emphasis opened BEFORE this `==` would close inside its body.
 *
 * Obsidian's reader (remark-parse 8) tokenizes left to right, so whichever construct opens first
 * consumes its span: `**a==b**c==` is strong `a==b` and no highlight, `==a**b==c**` a highlight
 * `a**b` and no strong (Reading view, 1.14.5 recorded and 1.15.0 asked). micromark pairs emphasis
 * only after this construct has taken its span, so without this check the highlight won both.
 *
 * Simulated with CommonMark's pairing on the runs micromark has already marked: the runs before
 * the `==` pair among themselves first, then the body's runs -- with the `==` read as the plain
 * punctuation they would be without a highlight -- close the nearest opener. A body closer that
 * reaches an opener from before the `==` crosses it. Undecidable cases (the rule of three) are
 * left to the highlight, as before.
 */
function emphasisClosesInside(self: TokenizeContext, body: string): boolean {
  const events = self.events;
  let paired = pairedRuns.get(self);
  // Carry on from the pairing of the events already read while they stand as they were.
  // micromark only appends to them, except where a failed attempt truncates them or a resolver
  // (a link's, a footnote call's) rewrites them from some point on, and either replaces or moves
  // the event this pairing stopped after.
  if (
    paired?.events !== events ||
    paired.read > events.length ||
    (paired.read > 0 && events[paired.read - 1] !== paired.last)
  ) {
    paired = { events, read: 0, last: undefined, stack: [] };
    pairedRuns.set(self, paired);
  }
  const stack = paired.stack;
  const take = (run: Run, outer: boolean): boolean => {
    if (run.close) {
      for (let at = stack.length - 1; at >= 0 && run.size > 0; at -= 1) {
        const entry = stack[at]!;
        if (entry.run.marker !== run.marker) continue;
        if (entry.outer && !outer) return true;
        const used = Math.min(entry.run.size, run.size);
        entry.run.size -= used;
        run.size -= used;
        if (entry.run.size === 0) stack.splice(at, 1);
      }
    }
    if (run.open && run.size > 0) stack.push({ run, outer });
    return false;
  };

  for (; paired.read < events.length; paired.read += 1) {
    const [kind, token] = events[paired.read]!;
    if (kind !== "enter" || token.type !== "attentionSequence") continue;
    const text = self.sliceSerialize(token);
    const flags = token as typeof token & { _open?: boolean; _close?: boolean };
    take(
      {
        marker: text[0]!,
        size: text.length,
        open: Boolean(flags._open),
        close: Boolean(flags._close),
      },
      true,
    );
  }
  paired.last = events[paired.read - 1];
  // Every entry is an opener from before the `==` here. The body's runs never change one -- a
  // closer reaching one returns first -- and their own openers stack above them, so cutting the
  // stack back to this length leaves it as the events alone made it, for the next `==`.
  const outer = stack.length;
  if (outer === 0) return false;
  try {
    for (const match of body.matchAll(/\*+|_+/gu)) {
      const start = match.index;
      const end = start + match[0].length;
      const run = flank(
        match[0][0]!,
        match[0].length,
        group(start > 0 ? body[start - 1] : MARKER),
        group(end < body.length ? body[end] : MARKER),
      );
      if (take(run, false)) return true;
    }
    return false;
  } finally {
    stack.length = outer;
  }
}

export function highlightSyntax(): Extension {
  return { text: { [EQUALS]: highlight } };
}
