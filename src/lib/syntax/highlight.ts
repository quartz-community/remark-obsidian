import type {
  Code,
  Construct,
  Event,
  Extension,
  Resolver,
  State,
  Token,
  TokenizeContext,
  Tokenizer,
  Effects,
} from "micromark-util-types";
import { splice } from "micromark-util-chunked";
import { classifyCharacter } from "micromark-util-classify-character";
import { resolveAll } from "micromark-util-resolve-all";
import { constants, types } from "micromark-util-symbol";

const EQUALS = 61;
const BACKSLASH = 92;
const SEQUENCE_SIZE = 2;

/**
 * A backslash does not escape `=` in Obsidian, so `==text\==` is a highlight
 * holding `text\` rather than literal text.
 *
 * CommonMark escapes any ASCII punctuation, which makes the `=` plain data and
 * leaves the highlight unclosed. This runs ahead of the core escape and takes
 * only a `\=` whose run would *close*, emitting the backslash as data so the
 * `=` is still seen as a delimiter.
 *
 * The asymmetry is Obsidian's, and measured: `\==text==` opens nothing, so an
 * escape before an opening run is still honoured and falls through to the core
 * construct. Every other escape falls through untouched too.
 */
const unescapedEquals: Construct = {
  name: "highlightEscape",
  tokenize(
    this: TokenizeContext,
    effects: Effects,
    ok: State,
    nok: State,
  ): State {
    const opened = hasOpenSequence(this);
    const closingRun: Construct = {
      partial: true,
      tokenize(scan, scanOk, scanNok) {
        let size = 0;
        return function enter(code: Code): State | undefined {
          scan.enter("data");
          return run(code);
        };

        function run(code: Code): State | undefined {
          if (code === EQUALS && size < SEQUENCE_SIZE) {
            scan.consume(code);
            size++;
            return run;
          }
          scan.exit("data");
          if (size < SEQUENCE_SIZE) return scanNok(code);
          // The character before the run is the backslash, so it always
          // classifies as punctuation; only what follows decides. A run that
          // would open is left to the core escape, which is the half of the
          // asymmetry Obsidian does honour.
          return classifyCharacter(code) ? scanOk(code) : scanNok(code);
        }
      },
    };

    return start;

    function start(code: Code): State | undefined {
      if (code !== BACKSLASH) return nok(code);
      // With nothing open there is no closer to protect, and Obsidian escapes
      // normally: `\==text\==` keeps neither backslash and highlights nothing.
      if (!opened) return nok(code);
      effects.enter("data");
      effects.consume(code);
      return after;
    }

    function after(code: Code): State | undefined {
      if (code !== EQUALS) return nok(code);
      return effects.check(closingRun, literal, nok)(code);
    }

    function literal(code: Code): State | undefined {
      effects.exit("data");
      return ok(code);
    }
  },
};

/**
 * `==highlight==` as an attention construct, matching how micromark implements
 * emphasis and strikethrough. Scanning for a closer inline instead would keep the
 * content as one opaque token, which cannot span lines and leaves nested syntax
 * such as `==a **b** c==` unparsed.
 */
export function highlightSyntax(): Extension {
  const tokenizer = {
    name: "highlight",
    tokenize: tokenizeHighlight as Tokenizer,
    resolveAll: resolveAllHighlight as Resolver,
  };

  return {
    text: { [EQUALS]: tokenizer, [BACKSLASH]: unescapedEquals },
    insideSpan: { null: [tokenizer] },
    attentionMarkers: { null: [EQUALS] },
  };
}

/** Whether an unresolved opening `==` run is already on the event stack. */
function hasOpenSequence(context: TokenizeContext): boolean {
  const events = context.events;
  let index = events.length;
  while (index--) {
    const event = events[index];
    if (!event || event[0] !== "exit") continue;
    if (event[1].type !== "highlightSequenceTemporary") continue;
    if ((event[1] as Token & { _open?: boolean })._open) return true;
  }
  return false;
}

function resolveAllHighlight(
  events: Event[],
  context: TokenizeContext,
): Event[] {
  let index = -1;

  while (++index < events.length) {
    if (
      events[index][0] === "enter" &&
      events[index][1].type === "highlightSequenceTemporary" &&
      (events[index][1] as Token & { _close?: boolean })._close
    ) {
      let open = index;

      while (open--) {
        const candidate = events[open][1] as Token & { _open?: boolean };
        if (
          events[open][0] === "exit" &&
          candidate.type === "highlightSequenceTemporary" &&
          candidate._open &&
          events[index][1].end.offset - events[index][1].start.offset ===
            candidate.end.offset - candidate.start.offset
        ) {
          // `====` would otherwise pair into a highlight with no content.
          if (candidate.end.offset === events[index][1].start.offset) continue;

          events[index][1].type = "highlightSequence";
          candidate.type = "highlightSequence";

          const highlight: Token = {
            type: "highlight",
            start: Object.assign({}, candidate.start),
            end: Object.assign({}, events[index][1].end),
          };

          const text: Token = {
            type: "highlightText",
            start: Object.assign({}, candidate.end),
            end: Object.assign({}, events[index][1].start),
          };

          const nextEvents: Event[] = [
            ["enter", highlight, context],
            ["enter", candidate, context],
            ["exit", candidate, context],
            ["enter", text, context],
          ];

          const insideSpan = context.parser.constructs.insideSpan.null;
          if (insideSpan) {
            splice(
              nextEvents,
              nextEvents.length,
              0,
              resolveAll(insideSpan, events.slice(open + 1, index), context),
            );
          }

          splice(nextEvents, nextEvents.length, 0, [
            ["exit", text, context],
            ["enter", events[index][1], context],
            ["exit", events[index][1], context],
            ["exit", highlight, context],
          ]);

          splice(events, open - 1, index - open + 3, nextEvents);
          index = open + nextEvents.length - 2;
          break;
        }
      }
    }
  }

  index = -1;
  while (++index < events.length) {
    if (events[index][1].type === "highlightSequenceTemporary") {
      events[index][1].type = types.data;
    }
  }

  return events;
}

function tokenizeHighlight(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const previous = this.previous;
  let size = 0;

  return start;

  function start(code: Code): State | undefined {
    if (code !== EQUALS) return nok(code);
    effects.enter("highlightSequenceTemporary");
    return more(code);
  }

  function more(code: Code): State | undefined {
    const before = classifyCharacter(previous);

    // Take exactly two and leave further `=` as data: consuming the whole run
    // would pair the *last* `==` of `==x====` instead of the first.
    if (code === EQUALS && size < SEQUENCE_SIZE) {
      effects.consume(code);
      size++;
      return more;
    }

    if (size < SEQUENCE_SIZE) return nok(code);

    const token = effects.exit("highlightSequenceTemporary") as Token & {
      _open?: boolean;
      _close?: boolean;
    };
    const after = classifyCharacter(code);
    token._open =
      !after || (after === constants.attentionSideAfter && Boolean(before));
    token._close =
      !before || (before === constants.attentionSideAfter && Boolean(after));
    return ok(code);
  }
}
