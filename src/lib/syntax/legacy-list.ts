import { ok as assert } from "devlop";
import { factorySpace } from "micromark-factory-space";
import { blankLine, thematicBreak } from "micromark-core-commonmark";
import { asciiDigit, markdownSpace } from "micromark-util-character";
import { codes, constants, types } from "micromark-util-symbol";
import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";

/**
 * Obsidian's list container, vendored from micromark's and then diverged.
 *
 * Obsidian runs a fork of `remark-parse@8`, whose list parsing is more permissive
 * than CommonMark's in ways seven recorded cases depend on. The legacy stack
 * agrees with Obsidian on every one of them.
 *
 * Why a whole copy rather than a narrower hook. `list` is a **container**, and a
 * container owns its own continuation: once stock `list` opens an item, every
 * later line is handed to *that construct's* `continuation` directly rather than
 * to the registered `document` map, and its `notInCurrentItem` retries stock
 * `list` by direct reference. So a prepended construct that declines the cases it
 * does not want never sees the second item of a list stock opened -- the
 * "decline and fall through" shape that works for `legacyCodeSpans` and
 * `legacyAutolinks` has no container equivalent, because those are `text`
 * constructs with no cross-line state.
 *
 * Repairing the tree afterwards was the other candidate and is worse: `lineOffsets`
 * is populated from `listItemPrefix` and `listItemIndent` token exits, which happen
 * before any transform runs, so synthesised items would need a parallel set of
 * hand-maintained offsets. A wrong offset is worse than a missing one.
 *
 * Every token type is stock's, so no `fromMarkdown` extension is needed and the
 * mdast comes out identical. The single structural edit is the recursive call in
 * `notInCurrentItem`, which must point here rather than at stock `list` or the
 * divergences stop applying from the second item onward.
 */
const legacyList: Construct = {
  name: "legacyList",
  tokenize: tokenizeListStart,
  continuation: { tokenize: tokenizeListContinuation },
  exit: tokenizeListEnd,
};

const listItemPrefixWhitespaceConstruct: Construct = {
  partial: true,
  tokenize: tokenizeListItemPrefixWhitespace,
};

const indentConstruct: Construct = {
  partial: true,
  tokenize: tokenizeIndent,
};

/**
 * Flow constructs whose content is LITERAL, so no line inside one can be a sibling marker.
 *
 * That is the whole justification for admitting a shallower line while one is open -- see
 * `tokenizeIndent`. `mathFlow` belongs here for the same reason `codeFenced` does, and it was
 * measured rather than assumed: `*⟨4sp⟩$$` / `⟨3sp⟩x` / `⟨3sp⟩[^2]: y` / `⟨5sp⟩$$` reports no
 * reference in Obsidian and reported one here until it was added.
 *
 * `htmlFlow` is deliberately ABSENT: `*⟨4sp⟩<div>` / `⟨3sp⟩x` / `⟨3sp⟩[^2]: y` already agrees,
 * because an html block's own continuation rules keep the line. Adding it would be a change
 * with nothing to fix.
 */
const LITERAL = new Set(["codeFenced", "mathFlow"]);

/**
 * Replaces the list container, for Obsidian's more permissive list rules.
 *
 * Registered under every marker character stock `list` answers to, so this
 * construct and not stock's is the one that opens a list -- which is what lets it
 * own the continuation too.
 */
export function legacyListSyntax(): Extension {
  const document: Record<number, Construct> = {
    [codes.asterisk]: legacyList,
    [codes.plusSign]: legacyList,
    [codes.dash]: legacyList,
  };
  for (let code = codes.digit0; code <= codes.digit9; code++) {
    document[code] = legacyList;
  }
  return { document };
}

function tokenizeListStart(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;
  const tail = self.events[self.events.length - 1];
  let initialSize =
    tail && tail[1].type === types.linePrefix
      ? tail[2].sliceSerialize(tail[1], true).length
      : 0;
  let size = 0;

  return start;

  function start(code: Code): State | undefined {
    assert(self.containerState, "expected state");
    const kind =
      self.containerState.type ||
      (code === codes.asterisk || code === codes.plusSign || code === codes.dash
        ? types.listUnordered
        : types.listOrdered);

    if (
      kind === types.listUnordered
        ? !self.containerState.marker || code === self.containerState.marker
        : asciiDigit(code)
    ) {
      if (!self.containerState.type) {
        self.containerState.type = kind;
        effects.enter(kind, { _container: true });
      }

      if (kind === types.listUnordered) {
        effects.enter(types.listItemPrefix);
        return code === codes.asterisk || code === codes.dash
          ? effects.check(thematicBreak, nok, atMarker)(code)
          : atMarker(code);
      }

      if (!self.interrupt || code === codes.digit1) {
        effects.enter(types.listItemPrefix);
        effects.enter(types.listItemValue);
        return inside(code);
      }
    }

    return nok(code);
  }

  function inside(code: Code): State | undefined {
    assert(self.containerState, "expected state");
    // No ceiling on the marker's value. CommonMark caps an ordered marker at nine
    // digits and stock enforces it as `++size < constants.listItemValueSizeMax`;
    // `remark-parse@8` has no cap, parsing `12345678901.` as a list with
    // `start=12345678901`, and Obsidian reports `1234567890. not ok` as a list.
    //
    // `size` is still counted, because the `size < 2` test below uses it to stop
    // a multi-digit marker interrupting a paragraph.
    if (asciiDigit(code)) {
      size++;
      effects.consume(code);
      return inside;
    }

    if (
      (!self.interrupt || size < 2) &&
      (self.containerState.marker
        ? code === self.containerState.marker
        : code === codes.rightParenthesis || code === codes.dot)
    ) {
      effects.exit(types.listItemValue);
      return atMarker(code);
    }

    return nok(code);
  }

  function atMarker(code: Code): State | undefined {
    assert(self.containerState, "expected state");
    assert(code !== codes.eof, "eof (`null`) is not a marker");
    effects.enter(types.listItemMarker);
    effects.consume(code);
    effects.exit(types.listItemMarker);
    self.containerState.marker = self.containerState.marker || code;
    return effects.check(
      blankLine,
      // An empty item *may* interrupt a paragraph, where stock refuses outright.
      // `foo` over `*` is a paragraph and then an empty list to `remark-parse@8`
      // and to Obsidian, where CommonMark reads one paragraph holding both lines.
      // `foo` over `*bar` is unaffected, being no marker at all.
      //
      // Except a dash, which is also a setext underline -- and the underline wins:
      // `H` over `-` is a **heading**, as three recorded cases require. Same
      // asymmetry `lazy-setext.ts` measures from the other side, where `---` as a
      // lazy line is a thematic break while `===` is absorbed. Only a marker with
      // a second reading loses.
      self.interrupt && self.containerState.marker === codes.dash
        ? nok
        : onBlank,
      effects.attempt(
        listItemPrefixWhitespaceConstruct,
        endOfPrefix,
        otherPrefix,
      ),
    );
  }

  function onBlank(code: Code): State | undefined {
    assert(self.containerState, "expected state");
    self.containerState.initialBlankLine = true;
    initialSize++;
    return endOfPrefix(code);
  }

  function otherPrefix(code: Code): State | undefined {
    if (markdownSpace(code)) {
      // THE FIVE-SPACE CAP FIRED. `listItemPrefixWhitespaceConstruct` declines once the
      // separator reaches five columns, so reaching here with a space means the item's content
      // is its own indented CODE and the content column falls back to the marker plus one.
      // Recorded on the container because B3's minimum applies to exactly these items -- see
      // `tokenizeIndent`.
      (
        self.containerState as unknown as { _legacyCapped?: boolean }
      )._legacyCapped = true;
      effects.enter(types.listItemPrefixWhitespace);
      effects.consume(code);
      effects.exit(types.listItemPrefixWhitespace);
      return endOfPrefix;
    }

    return nok(code);
  }

  function endOfPrefix(code: Code): State | undefined {
    assert(self.containerState, "expected state");
    self.containerState.size =
      initialSize +
      self.sliceSerialize(effects.exit(types.listItemPrefix), true).length;
    return ok(code);
  }
}

function tokenizeListContinuation(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;

  assert(self.containerState, "expected state");
  self.containerState._closeFlow = undefined;

  return effects.check(blankLine, onBlank, notBlank);

  function onBlank(code: Code): State | undefined {
    assert(self.containerState, "expected state");
    assert(typeof self.containerState.size === "number", "expected size");
    self.containerState.furtherBlankLines =
      self.containerState.furtherBlankLines ||
      self.containerState.initialBlankLine;

    (
      self.containerState as unknown as { _legacyBlank?: boolean }
    )._legacyBlank = true;

    // We have a blank line.
    // Still, try to consume at most the items size.
    return factorySpace(
      effects,
      ok,
      types.listItemIndent,
      self.containerState.size + 1,
    )(code);
  }

  function notBlank(code: Code): State | undefined {
    assert(self.containerState, "expected state");
    // AN EMPTY ITEM IS NOT CLOSED BY A FURTHER BLANK LINE, which is `remark-parse@8` and not
    // CommonMark -- the spec says an item "can begin with at most one blank line", and
    // `furtherBlankLines` is set only when `initialBlankLine` was, so this condition fires
    // exactly for an item that began empty and then met another blank.
    //
    // Twenty-two probes against live Obsidian settle it, and the discriminator is the item's
    // CONTENT rather than the gap:
    //
    //     "- item" / blank / ⇥[^1]: x    col 1 BOTH sides -- a non-empty item already survives
    //     "-"      / blank / ⇥[^1]: x    col 1 obs, CODE ours
    //     "-" / blank / blank / ⇥...     col 1 obs -- further blanks do not break it either
    //     "-" / blank / "Para" / ...     CODE both -- a paragraph DOES end the list
    //     "-" / blank / "# Head" / ...   CODE both, and the same for a fence and a quote
    //     "-" / blank / "---" / ...      col 1 obs -- a thematic break does NOT end it
    //     "-" / blank / "- " / ...       col 1 obs -- nor does a second marker
    //
    // So nine of the wave's nine divergences have one cause, and this is it.
    if (!markdownSpace(code)) {
      self.containerState.furtherBlankLines = undefined;
      self.containerState.initialBlankLine = undefined;
      return notInCurrentItem(code);
    }

    self.containerState.furtherBlankLines = undefined;
    self.containerState.initialBlankLine = undefined;
    return effects.attempt(indentConstruct, ok, notInCurrentItem)(code);
  }

  function notInCurrentItem(code: Code): State | undefined {
    assert(self.containerState, "expected state");
    // While we do continue, we signal that the flow should be closed.
    self.containerState._closeFlow = true;
    // As we're closing flow, we're no longer interrupting.
    self.interrupt = undefined;
    // Always populated by defaults.
    assert(
      self.parser.constructs.disable.null,
      "expected `disable.null` to be populated",
    );
    // A sibling marker may be indented up to, but not including, the open item's
    // own indent. Stock caps this at `constants.tabSize` whatever the item's
    // indent is, so the fourth line of ` - a` / `  - b` / `   - c` / `    - d`
    // exceeds the cap and becomes indented code, where legacy and Obsidian both
    // report four flat items. Legacy's rule is relative: an indent below the
    // previous item's starts a sibling.
    //
    // `size` is set in `endOfPrefix` and so is always present during continuation;
    // the fallback only keeps the type honest.
    const itemIndent = self.containerState.size ?? constants.tabSize;
    return factorySpace(
      effects,
      // `legacyList`, not stock `list`: the recursive retry is how the second and
      // later items of a list are opened, so pointing it at stock would apply
      // every divergence to the first item only.
      effects.attempt(legacyList, ok, nok),
      types.linePrefix,
      self.parser.constructs.disable.null.includes("codeIndented")
        ? undefined
        : Math.max(itemIndent, constants.tabSize),
    )(code);
  }
}

function tokenizeIndent(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;

  assert(self.containerState, "expected state");
  assert(typeof self.containerState.size === "number", "expected size");

  return factorySpace(
    effects,
    afterPrefix,
    types.listItemIndent,
    self.containerState.size + 1,
  );

  function afterPrefix(code: Code): State | undefined {
    assert(self.containerState, "expected state");
    const tail = self.events[self.events.length - 1];
    if (!tail || tail[1].type !== types.listItemIndent) return nok(code);
    const got = tail[2].sliceSerialize(tail[1], true).length;
    if (got === self.containerState.size) return ok(code);
    // B3's minimum, SAFE because a fence is open.
    //
    // An item's content column is the smallest indentation among its own lines, and a floor can
    // only FALL as lines arrive -- so admitting a shallower line and lowering the size is that
    // minimum computed in a stream. Applied unconditionally it costs 32 referee documents and
    // four CommonMark list cases, because a shallower line is how a SIBLING MARKER announces
    // itself. Inside a fenced block it cannot be: fence content is literal, so no line in it
    // starts a list item.
    // AND NO BLANK LINE HAS INTERVENED. Every one of the 16 documents this cost without the
    // check has a blank between the fence's content and the shallower line, and Obsidian ends
    // the item there rather than letting the fence reach across it:
    //
    //     10.⟨4sp⟩```` / ⟨7sp⟩It / blank / ⟨2sp⟩[^a]: body text   the definition SURVIVES
    //
    // `furtherBlankLines` does not cover this -- it is only set when the item's FIRST line was
    // blank -- so the flag is kept here.
    const seenBlank = (
      self.containerState as unknown as { _legacyBlank?: boolean }
    )._legacyBlank;
    if (
      got > 0 &&
      got < (self.containerState.size as number) &&
      !seenBlank &&
      (inFence() || capped())
    ) {
      self.containerState.size = got;
      return ok(code);
    }
    // A LEADING TAB makes the marker irrelevant, and the content column is 1.
    //
    // Sixty probes, five marker shapes crossed with twelve indents, and the tab rows are
    // identical in all five: `tab` through `tab+3` define at COLUMN 1 whether the item is `-`,
    // `- `, `10.` or `10. `, and `tab+4` is code. The threshold is the tab stop plus four, which
    // this file already carries; the column being uniformly 1 is what four earlier attempts had
    // to guess at.
    //
    // USELESS WITHOUT THE `notBlank` CHANGE ABOVE, and measured alone it is worth +1 referee
    // document. `-` / blank / `⇥[^1]: x` closes the item in `notBlank` before this is ever
    // consulted, so the line is evaluated at root and becomes indented code. The two halves are
    // one fix, which is the shape that took the isolate axis from 43 to 0.
    // ...and the tab must REACH the item's content column, which the sibling project's own
    // indent probes supply and the first version of this branch ignored:
    //
    //     "-"      / blank / ⇥[^1]: def    content col 2, tab reaches 4   -> def col 1
    //     "- item" / blank / ⇥[^1]: def    content col 2                  -> def col 1
    //     "-    p" / blank / ⇥[^1]: def    content col 5                  -> ROOT code [[2,2]]
    //     "100. a" / blank / ⇥[^1]: def    content col 5                  -> ROOT code [[2,2]]
    //     "1000. p"/ blank / ⇥[^1]: def    content col 6                  -> ROOT code [[2,2]]
    //
    // Claiming the line unconditionally cost eight documents on the `code` dimension, all of
    // that shape: a wide marker or a wide separator puts the content column past the tab stop,
    // and a line that cannot reach it was never the item's. `got === size` is already handled
    // above, so this is the strictly-deeper case.
    const raw = tail[2].sliceSerialize(tail[1]);
    if (
      raw.startsWith("\t") &&
      got > (self.containerState.size as number) &&
      got < constants.tabSize * 2
    ) {
      self.containerState.size = 1;
      return ok(code);
    }
    return nok(code);
  }

  /**
   * Whether the five-space cap fired when this item opened.
   *
   * B3's minimum applies to exactly these items, which the probes separate cleanly:
   *
   *     ⟨2sp⟩1.⟨5sp⟩Prose here / ⟨4sp⟩[^1]: Definition    obs 1@1:4 -- the line JOINS the item
   *     10.⟨2sp⟩Moreend.       / ⟨2sp⟩[^ä]: Some words    obs ä at ROOT, column 0
   *
   * Both put a shallower line under a wide-ish marker and Obsidian treats them oppositely. What
   * separates them is the CAP: with five or more separator columns the item's content is its own
   * indented code, and a line above that floor is still the item's. Without the cap the item
   * ends. Admitting a shallower line for every item costs 21 documents of exactly the second
   * shape, with the definition moving from root to the item's column.
   */
  function capped(): boolean {
    return (
      (self.containerState as unknown as { _legacyCapped?: boolean })
        ._legacyCapped === true
    );
  }

  /**
   * Whether a fenced code block is open on this line.
   *
   * The DOCUMENT tokenizer's own events hold container tokens only -- `listUnordered`,
   * `listItemPrefix`, `chunkFlow` -- so scanning them for `codeFenced` finds nothing and the
   * first version of this returned false everywhere. The flow events live in the child
   * tokenizer micromark attaches to each `chunkFlow` token, and every chunk on a line shares
   * one, so the last chunk's tokenizer is the whole picture:
   *
   *     enter:codeFenced enter:codeFencedFence ... exit:codeFencedFence enter:lineEnding ...
   *
   * An `enter` with no matching `exit` is an open fence. Reading a `_tokenizer` is reaching into
   * micromark's internals, which is the price of this file being a vendored copy -- and it is
   * the only way the container can learn what the flow is in the middle of.
   */
  function inFence(): boolean {
    let child: { events?: Array<[string, { type: string }]> } | undefined;
    for (const [, token] of self.events) {
      if (token.type !== "chunkFlow") continue;
      const owned = (
        token as unknown as {
          _tokenizer?: { events?: Array<[string, { type: string }]> };
        }
      )._tokenizer;
      if (owned) child = owned;
    }
    let depth = 0;
    for (const [kind, token] of child?.events ?? []) {
      if (!LITERAL.has(token.type)) continue;
      depth += kind === "enter" ? 1 : -1;
    }
    return depth > 0;
  }
}

function tokenizeListEnd(this: TokenizeContext, effects: Effects): undefined {
  assert(this.containerState, "expected state");
  assert(typeof this.containerState.type === "string", "expected type");
  effects.exit(this.containerState.type);
}

function tokenizeListItemPrefixWhitespace(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;

  // Always populated by defaults.
  assert(
    self.parser.constructs.disable.null,
    "expected `disable.null` to be populated",
  );

  return factorySpace(
    effects,
    afterPrefix,
    types.listItemPrefixWhitespace,
    self.parser.constructs.disable.null.includes("codeIndented")
      ? undefined
      : constants.tabSize + 1,
  );

  function afterPrefix(code: Code): State | undefined {
    const tail = self.events[self.events.length - 1];

    return !markdownSpace(code) &&
      tail &&
      tail[1].type === types.listItemPrefixWhitespace
      ? ok(code)
      : nok(code);
  }
}
