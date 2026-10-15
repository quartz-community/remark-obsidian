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
    if (self.containerState.furtherBlankLines || !markdownSpace(code)) {
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
      inFence()
    ) {
      self.containerState.size = got;
      return ok(code);
    }
    return nok(code);
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
      if (token.type !== "codeFenced") continue;
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
