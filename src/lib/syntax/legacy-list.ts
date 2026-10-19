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
/**
 * Width in COLUMNS, counting a tab to its stop.
 *
 * `sliceSerialize(token, true)` is named `expandTabs` and does not expand: it replaces a tab
 * with ONE space, so `"2)<TAB>"` serialises to `"2) "` either way and its length is a CHARACTER
 * count. Every width in this file that is compared against another width has to use the same
 * unit, and the unit Obsidian uses is columns.
 *
 *     sliceSerialize(listItemPrefix)        "2)<TAB>"   3 characters
 *     sliceSerialize(listItemPrefix, true)  "2) "       3 characters
 *     columnsOfRaw("2)<TAB>")                           4 columns
 *
 * NOT `item-dot-threshold.ts`'s exported `columnsOf`, which looks identical and is not: that
 * one STOPS at the first non-whitespace character, so it measures a line's leading indent and
 * returns 0 for `"2)<TAB>"`. This one measures a whole prefix, marker included. Seven copies
 * of this tab-stop arithmetic exist in the package and they agree; the two that look most
 * alike are the two that must not be merged.
 *
 * The one genuine divergence among them is deliberate: `quote-indented-code.ts` counts a tab
 * AFTER a space as one column, because a tab after a space does not reach the indented-code
 * threshold in Obsidian. That asymmetry belongs to the threshold and not to a content column,
 * which is why it lives in exactly one of the seven.
 */
function columnsOfRaw(raw: string): number {
  let columns = 0;
  for (const character of raw) {
    columns +=
      character === "\t"
        ? constants.tabSize - (columns % constants.tabSize)
        : 1;
  }
  return columns;
}

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

  /** Whether `otherPrefix` fired, read locally -- `tokenizeIndent` has its own copy. */
  function capped(): boolean {
    return (
      (self.containerState as unknown as { _legacyCapped?: boolean })
        ._legacyCapped === true
    );
  }

  function endOfPrefix(code: Code): State | undefined {
    assert(self.containerState, "expected state");
    // COLUMNS FROM THE RAW SLICE, which is not what `expandTabs` gives. Measured on the token
    // stream rather than assumed:
    //
    //     sliceSerialize(listItemPrefix)        "2)\t"   3 chars
    //     sliceSerialize(listItemPrefix, true)  "2) "    3 chars  <- a tab becomes ONE space
    //
    // So `expandTabs` detabs rather than expanding to the stop, and `size` has been a CHARACTER
    // count for any prefix holding a tab. A note elsewhere in this package claimed it was
    // "ALREADY in columns, because sliceSerialize expands" -- that is wrong in both directions
    // and this is the measurement.
    //
    // It matters because `size` is the width the child flow skips. For
    // `2)<TAB><4sp>More` / `<7sp>[^1]: def` a size of 3 leaves the label line FOUR spaces,
    // exactly the indented-code threshold, so the code block swallows the definition. Four
    // leaves three and the definition survives at the content column, which is what Obsidian
    // reports.
    //
    // The first attempt at this counted columns from the EXPANDED slice and was inert by
    // construction -- that string holds no tab to expand.
    const prefix = self.sliceSerialize(effects.exit(types.listItemPrefix));
    self.containerState.size = initialSize + columnsOfRaw(prefix);
    // The OPENER's own content column, kept because B3's minimum lowers `size` as shallower
    // lines arrive and a fence closer is judged against the column the item STARTED with --
    // see `afterPrefix`.
    (
      self.containerState as unknown as { _legacyOpenSize?: number }
    )._legacyOpenSize = self.containerState.size;
    // THE CONTENT COLUMN, as a SECOND field beside the ownership threshold.
    //
    // `size` serves two roles and this package has now paid for that three times: `got` in
    // columns cost 38 documents, B3's minimum in the ownership test cost 32 and four CommonMark
    // cases, and carrying the single-digit-dot adjustment into `size` is +17 referee documents
    // and breaks `commonmark/list-items/273` and `274`.
    //
    // The two quantities genuinely differ for a CAPPED `1.` item: the prefix it consumed is
    // three columns, and `contentColumn` returns FOUR because `1.` counts one more column than
    // it occupies. Ownership wants three -- 273 needs `<7sp>more code` to be four past and
    // therefore code -- while the flow wants four, so a label at seven columns is three past
    // and stays a definition.
    (
      self.containerState as unknown as { _legacyContentColumn?: number }
    )._legacyContentColumn =
      self.containerState.size +
      (capped() && /^[ \t]*\d\.[ \t]*$/u.test(prefix) ? 1 : 0);
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

  // CONSUMED UP TO THE CONTENT COLUMN, not the ownership threshold. These differ only for a
  // capped single-digit-dot item, where the prefix is three columns and the content column is
  // four -- see `endOfPrefix`. Consuming the extra column is what leaves a label at seven
  // columns three past the content rather than four, so it stays a definition instead of
  // becoming indented code.
  //
  // Ownership still answers to `size` in `afterPrefix` below, which is what keeps
  // `commonmark/list-items/273` intact: its `<3sp>paragraph` lowers the column through B3's
  // minimum, so the later `<7sp>more code` is four past the LOWERED column and is code.
  const contentColumn =
    (self.containerState as unknown as { _legacyContentColumn?: number })
      ._legacyContentColumn ?? (self.containerState.size as number);

  return factorySpace(
    effects,
    afterPrefix,
    types.listItemIndent,
    contentColumn + 1,
  );

  function afterPrefix(code: Code): State | undefined {
    assert(self.containerState, "expected state");
    const tail = self.events[self.events.length - 1];
    if (!tail || tail[1].type !== types.listItemIndent) return nok(code);
    // CHARACTERS, deliberately, and NOT the columns `size` beside it uses. Auditing the two
    // other `expandTabs` sites after the prefix-width fix, both were tried as columns:
    //
    //     `got` in columns         referee 5964 -> 5926   -38
    //     `initialSize` in columns referee 5964            inert
    //
    // The reason is the note this file already carries: `size` SERVES TWO ROLES. It is the
    // content-column width, which wants columns, and it is `factorySpace`'s consumption limit,
    // which counts CODES. `got` measures what that limit actually consumed, so it has to be in
    // the limit's unit -- comparing it in columns compares a width against a code count and
    // loses 38 documents.
    //
    // So the unit mismatch between `got` and `size` is real and load-bearing, which is the
    // opposite of what the prefix-width fix suggested. `initialSize` is inert either way and
    // is left as it was rather than changed for tidiness.
    const got = tail[2].sliceSerialize(tail[1], true).length;
    // A FENCE DELIMITER is judged against the column the item OPENED with, not the running
    // minimum. `-<4sp>~~~` / `<2sp>body` / `<2sp>~~~` has the body lower `size` to 2, so the
    // closer at 2 would otherwise read as "at the content column" and be admitted -- while
    // Obsidian ends the item there and reads the closer as a new root fence. Compared against
    // the opener's 5 it is correctly shallower.
    const seenBlank = (
      self.containerState as unknown as { _legacyBlank?: boolean }
    )._legacyBlank;
    const openSize =
      (self.containerState as unknown as { _legacyOpenSize?: number })
        ._legacyOpenSize ?? (self.containerState.size as number);
    const isDelimiter = code === codes.graveAccent || code === codes.tilde;
    if (isDelimiter && got < openSize) return nok(code);
    // AND AFTER A BLANK LINE, every line is judged against the opening column, for the same
    // reason. `_legacyBlank` already guards the LOWERING branch below -- "no blank line has
    // intervened" -- and did not guard the later USE of a size some earlier shallower line
    // lowered:
    //
    //     "2)<5sp>More" / "<2sp>===" / blank / "<2sp>[^2]:"   obs col 0, ours col 2
    //     "2)<5sp>More" /              blank / "<2sp>[^2]:"   obs col 0, ours col 0  (agreed)
    //     "2)<5sp>More" / "<2sp>===" /         "<2sp>[^2]:"   obs col 2, ours col 2  (agreed)
    //
    // The separator caps the content column at 3; the `===` line at 2 lowers `size` to 2
    // before any blank has been seen, and the label at 2 then satisfies `got === size` and is
    // admitted. Judged against the opener's 3 it is correctly shallower and the definition is
    // at ROOT. The no-blank row is what keeps this from being the whole rule: there the lazy
    // continuation really does carry the lowered floor.
    if (seenBlank === true && got < openSize) return nok(code);
    // B3'S MINIMUM, APPLIED TO THE CONTENT COLUMN. A line shallower than the content column
    // lowers it, exactly as the existing branch below lowers `size` -- and this is the half
    // that reconciles the two fields with CommonMark.
    //
    //     "1.<5sp>indented code" / blank / "<3sp>paragraph" / blank / "<7sp>more code"
    //
    // `<3sp>paragraph` arrives at three with the content column at four. Lowering it to three
    // leaves `<7sp>more code` four past and therefore CODE, which is what 273 requires. Without
    // this the content column stays four, the extra column is consumed, and `more code` is a
    // paragraph.
    //
    // A label line with no shallower line above it keeps the column at four, which is the
    // divergence this pair of fields exists for.
    if (got >= (self.containerState.size as number) && got < contentColumn) {
      (
        self.containerState as unknown as { _legacyContentColumn?: number }
      )._legacyContentColumn = got;
    }
    if (got === self.containerState.size) {
      // EAT THE PENDING VIRTUAL SPACES. The preprocessor turns one tab into a `horizontalTab`
      // code plus virtual spaces filling to the next stop, and `factorySpace`'s limit counts
      // CODES -- so an item of size 2 takes the tab and ONE space, leaving three virtual spaces
      // for the child flow to read as indent. With the real space after them that is four
      // columns and the flow builds indented code where Obsidian defines at column 1:
      //
      //     "-" / blank / "<TAB><2sp>[^1]:"   obs col 1, ours none
      //     "-" / blank / "<TAB><3sp>[^1]:"   obs col 1, ours none
      //
      // An earlier attempt put this in the TAB BRANCH below, which `got === size` never
      // reaches -- it was inert for that reason rather than because the idea is wrong.
      return code === codes.virtualSpace ? eatVirtual(code) : ok(code);
    }

    function eatVirtual(next: Code): State | undefined {
      effects.enter(types.listItemIndent);
      return inside(next);

      function inside(inner: Code): State | undefined {
        if (inner === codes.virtualSpace) {
          effects.consume(inner);
          return inside;
        }
        effects.exit(types.listItemIndent);
        return ok(inner);
      }
    }
    // ...OR anywhere between the threshold and the content column, which is the window the two
    // fields open. Without this the extra column consumed above reads as "deeper than the
    // item" and the continuation is declined.
    if (got > (self.containerState.size as number) && got <= contentColumn) {
      return ok(code);
    }
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
    //
    // AND THE GATE SURVIVED THE TWO-FIELD SEPARATION, which was the first thing re-asked after
    // it. The argument for removing it was that `inFence() || capped()` exists because a
    // shallower line is how a SIBLING MARKER announces itself -- an ownership question -- and
    // ownership now has its own field. Removing the gate breaks SEVEN cases:
    //
    //     commonmark/list-items/295, /297, commonmark/lists/310, /312
    //     list/indent-staircase, probe/quote-nest/two-space,
    //     hunt/fold-mapping-inline-rewrite/1
    //
    // So the two fields are SEPARATE BUT NOT INDEPENDENT. The content column feeds
    // `tokenizeIndent`'s consumption limit, consumption decides how much indent the child flow
    // is handed, and that is observable -- so lowering the content column unconditionally still
    // changes structure, by a longer route than lowering `size` did. The separation buys the
    // capped-dot adjustment and does not buy this.
    // ...AND NOT THE FENCE'S OWN CLOSER, which is where the branch over-reached. A fence's
    // BODY at a shallower indent is the item's, and its CLOSER at a shallower indent is not:
    //
    //     "-<4sp>~~~" / "<2sp>body" / "<2sp>~~~"   list@0-1  code@2-3   body in, closer out
    //     "-<4sp>~~~" / "<5sp>body" / "<2sp>~~~"   list@0-1  code@2-3   same
    //     "-<4sp>~~~" / "<2sp>body" / "<5sp>~~~"   list@0-2             closer at the column
    //     "-<4sp>~~~" / "<2sp>~~~"                 list@0-0  code@1-2
    //
    // So Obsidian ends the item at a shallower closer and reads that line as a NEW root fence,
    // unclosed, running to the end of the note -- which is the `code@2-3` in every diverging
    // row. Indent 0 already behaved this way here, because `got > 0` excludes it.
    if (
      got > 0 &&
      got < (self.containerState.size as number) &&
      !seenBlank &&
      !isDelimiter &&
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
