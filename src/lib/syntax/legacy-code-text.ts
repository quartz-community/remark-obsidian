import { codeText } from "micromark-core-commonmark";
import { markdownLineEnding } from "micromark-util-character";
import { types } from "micromark-util-symbol";
import type {
  Code,
  Construct,
  Effects,
  Event,
  Extension,
  State,
  Token,
  TokenizeContext,
} from "micromark-util-types";

const GRAVE = 96;

interface Run {
  readonly offset: number;
  readonly width: number;
}

interface RunIndex {
  /** Offset the scan began at; runs before it are absent and never wanted. */
  readonly from: number;
  readonly runs: readonly Run[];
  /** Offsets of the runs of each width, ascending, for O(log n) lookahead. */
  readonly byWidth: Map<number, number[]>;
}

/**
 * One index per text tokenizer context, which is what makes this linear.
 *
 * Every opener needs to know what widths lie ahead of it. Scanning for that per
 * opener is the quadratic trap this construct exists to avoid, so the scan happens
 * once per context and every later opener reads the result.
 */
const indexes = new WeakMap<TokenizeContext, RunIndex>();

/**
 * Collect every backtick run to the end of the context, with absolute offsets.
 *
 * `now()` is called once per run rather than per character -- it is cheap, but
 * O(runs) and O(length) are different things here.
 *
 * Escapes are deliberately not modelled. A code span honours none (`` `a\`b` ``
 * closes at the escaped backtick and holds `a\`), and a backtick that some earlier
 * construct consumed is always *behind* the opener asking, since consumption runs
 * left to right. Every run ahead is therefore genuinely available.
 *
 * The consumes sit inside an open token because `check` restores the token stack
 * and desynchronises without one -- see `legacy-scan.ts`.
 */
function createRunScan(self: TokenizeContext, sink: Run[]): Construct {
  return {
    partial: true,
    tokenize(effects, ok): State {
      let width = 0;
      let offset = 0;

      return function enter(code: Code): State | undefined {
        effects.enter("legacyBacktickScan");
        return step(code);
      };

      function step(code: Code): State | undefined {
        if (code === null) {
          if (width > 0) sink.push({ offset, width });
          effects.exit("legacyBacktickScan");
          return ok(code);
        }
        if (code === GRAVE) {
          if (width === 0) offset = self.now().offset;
          width++;
        } else if (width > 0) {
          sink.push({ offset, width });
          width = 0;
        }
        effects.consume(code);
        return step;
      }
    },
  };
}

function buildIndex(from: number, runs: readonly Run[]): RunIndex {
  const byWidth = new Map<number, number[]>();
  for (const run of runs) {
    const list = byWidth.get(run.width);
    if (list) list.push(run.offset);
    else byWidth.set(run.width, [run.offset]);
  }
  return { from, runs, byWidth };
}

/**
 * The run beginning exactly at `offset`.
 *
 * Binary search rather than a scan: this is asked once per opener, and a linear
 * lookup here made a document of 7000 width-2 runs quadratic even though every
 * individual decision was O(log n).
 */
function runAt(index: RunIndex, offset: number): Run | undefined {
  const { runs } = index;
  let lo = 0;
  let hi = runs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (runs[mid]!.offset < offset) lo = mid + 1;
    else hi = mid;
  }
  const found = runs[lo];
  return found?.offset === offset ? found : undefined;
}

/** Whether a run of exactly `width` begins after `offset`. */
function widthAfter(
  index: RunIndex,
  width: number,
  offset: number,
): number | undefined {
  const list = index.byWidth.get(width);
  if (!list) return undefined;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]! <= offset) lo = mid + 1;
    else hi = mid;
  }
  return list[lo];
}

/**
 * Obsidian retries an inline-code opener that finds no closer of its own width.
 *
 *     ``code`     a literal backtick, then a code span holding `code`
 *     ```code`    two literal backticks, then the same span
 *     ``a⏎b`      a literal backtick, then a span holding `a b`
 *
 * CommonMark requires a closer of exactly the opener's width and leaves the whole
 * run literal without one. Obsidian sheds backticks from the left until the
 * opener's width matches a closer that does occur ahead. A short opener never
 * *grows*, which is the asymmetry that makes it a rule: `` `code`` `` stays
 * literal.
 *
 * Context is irrelevant -- emphasis, strong, heading, blockquote, list item, table
 * cell and link label all behave exactly as the bare case -- which is why this
 * belongs in the tokenizer and not in a repair pass over the tree.
 *
 * ## Why a construct and not a transform
 *
 * A transform would have to undo work the parser already did: the retry span's body
 * must be shielded from emphasis, links and html, and by then those nodes exist.
 * Doing it here also keeps the span's line ending inside the span, before
 * `breakPositionsTransform` turns soft endings into `break` nodes.
 *
 * ## Why this is linear
 *
 * Stock is not. cmark's increasing-run shape makes every opener scan to the end and
 * fail, and micromark grows as roughly bytes^1.5 on it -- 2.1s at 125KB, 133s at
 * 2MB. Those failures are *precisely* the openers this construct decides, so:
 *
 * - the run index is built once per context, costing one pass;
 * - an opener whose width occurs ahead returns `nok`, and stock then consumes a
 *   range no other opener will scan;
 * - an opener with nothing usable ahead is emitted as data here, so stock never
 *   runs its failing end-of-context scan at all;
 * - probing downwards from `N-1` for the widest usable closer costs at most `N`
 *   lookups, charged to an opener that already holds `N` backticks, so the probes
 *   across a document total no more than its backticks.
 *
 * `previous` is stock's own predicate, and copying it is not optional. It is
 * consulted only by the text initializer's `atBreak`, which decides whether the
 * construct list is tried at all; a prepended construct without it would make the
 * list reachable at a mid-run backtick, where stock's tokenizer asserts
 * `expected correct previous` and throws under `--conditions=development`.
 */
const legacyCodeText: Construct = {
  name: "legacyCodeText",
  previous(this: TokenizeContext, code: Code): boolean {
    return (
      code !== GRAVE ||
      this.events[this.events.length - 1]![1].type === types.characterEscape
    );
  },
  /**
   * Stock's resolver, applied to the span alone.
   *
   * It addresses its events by fixed offsets from both ends (`3` and `length - 4`)
   * to find the padding candidates, so the shed backticks have to be excluded or
   * it reads a literal backtick as the span's first content.
   */
  resolve(events: Event[], context: TokenizeContext): Event[] {
    const start = events.findIndex(
      ([kind, token]) => kind === "enter" && token.type === types.codeText,
    );
    if (start === -1) return events;
    const resolved = codeText.resolve!(events.slice(start), context);
    return [...events.slice(0, start), ...resolved];
  },
  tokenize(
    this: TokenizeContext,
    effects: Effects,
    ok: State,
    nok: State,
  ): State {
    const self = this;
    const scanned: Run[] = [];
    const scan = createRunScan(self, scanned);

    let index: RunIndex;
    let at = 0;
    let shed = 0;
    let openWidth = 0;
    let size = 0;
    let sequence: Token;

    return start;

    function start(code: Code): State | undefined {
      at = self.now().offset;
      const cached = indexes.get(self);
      // A rewind below the scan's origin would leave runs unrecorded, so rebuild
      // rather than answer from an index that cannot see them.
      if (cached && cached.from <= at) {
        index = cached;
        return decide(code);
      }
      scanned.length = 0;
      return effects.check(scan, built, built)(code);
    }

    function built(code: Code): State | undefined {
      index = buildIndex(at, [...scanned]);
      indexes.set(self, index);
      return decide(code);
    }

    function decide(code: Code): State | undefined {
      const here = runAt(index, at);
      // Nothing to add if the index cannot see this run: let stock decide.
      if (!here) return nok(code);
      openWidth = here.width;

      // Stock handles every opener whose own width occurs ahead, and handles it
      // correctly -- 9 of the 25 corpus cases carrying this shape are already
      // `match` for that reason.
      if (widthAfter(index, openWidth, at) !== undefined) return nok(code);

      let retry = 0;
      for (let width = openWidth - 1; width > 0; width--) {
        if (widthAfter(index, width, at) !== undefined) {
          retry = width;
          break;
        }
      }

      // No closer of any usable width: the run is literal. Emitting it here is
      // what spares stock the end-of-context scan it would fail at, and is why a
      // document of increasing runs stops being superlinear.
      if (retry === 0) {
        shed = openWidth;
        effects.enter(types.data);
        return literal(code);
      }

      shed = openWidth - retry;
      openWidth = retry;
      effects.enter(types.data);
      return shedSequence(code);
    }

    // These three test before consuming rather than after, as stock's
    // `sequenceOpen` does. Counting down around an unconditional `consume` leaves
    // the transition holding a code that is already eaten, which micromark catches
    // as `expected code to not have been consumed`.
    function literal(code: Code): State | undefined {
      if (shed > 0) {
        shed--;
        effects.consume(code);
        return literal;
      }
      effects.exit(types.data);
      return ok(code);
    }

    /** The backticks the opener gives up, which render as themselves. */
    function shedSequence(code: Code): State | undefined {
      if (shed > 0) {
        shed--;
        effects.consume(code);
        return shedSequence;
      }
      effects.exit(types.data);
      effects.enter(types.codeText);
      effects.enter(types.codeTextSequence);
      size = openWidth;
      return openSequence(code);
    }

    function openSequence(code: Code): State | undefined {
      if (size > 0) {
        size--;
        effects.consume(code);
        return openSequence;
      }
      effects.exit(types.codeTextSequence);
      return between(code);
    }

    // `between`, `data` and `sequenceClose` mirror `micromark-core-commonmark`'s
    // `code-text.js` so the body tokenises exactly as a stock span's does, which
    // is what lets stock's resolver handle padding and line endings unchanged.
    function between(code: Code): State | undefined {
      if (code === null) return nok(code);

      if (code === 32) {
        effects.enter("space");
        effects.consume(code);
        effects.exit("space");
        return between;
      }

      if (code === GRAVE) {
        sequence = effects.enter(types.codeTextSequence);
        size = 0;
        return sequenceClose(code);
      }

      if (markdownLineEnding(code)) {
        effects.enter(types.lineEnding);
        effects.consume(code);
        effects.exit(types.lineEnding);
        return between;
      }

      effects.enter(types.codeTextData);
      return data(code);
    }

    function data(code: Code): State | undefined {
      if (
        code === null ||
        code === 32 ||
        code === GRAVE ||
        markdownLineEnding(code)
      ) {
        effects.exit(types.codeTextData);
        return between(code);
      }
      effects.consume(code);
      return data;
    }

    function sequenceClose(code: Code): State | undefined {
      if (code === GRAVE) {
        effects.consume(code);
        size++;
        return sequenceClose;
      }

      if (size === openWidth) {
        effects.exit(types.codeTextSequence);
        effects.exit(types.codeText);
        return ok(code);
      }

      // A run of the wrong width is content, exactly as it is for stock.
      sequence.type = types.codeTextData;
      return data(code);
    }
  },
};

/**
 * Lets an inline-code opener retry with a shorter width, as Obsidian does.
 */
export function legacyCodeTextSyntax(): Extension {
  return { text: { [GRAVE]: legacyCodeText } };
}
