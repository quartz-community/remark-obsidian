import type {
  Code,
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
const SEQUENCE_SIZE = 2;

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
    text: { [EQUALS]: tokenizer },
    insideSpan: { null: [tokenizer] },
    attentionMarkers: { null: [EQUALS] },
  };
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
