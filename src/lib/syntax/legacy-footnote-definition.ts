import { blankLine } from "micromark-core-commonmark";
import { factorySpace } from "micromark-factory-space";
import { codes, constants, types } from "micromark-util-symbol";
import { orderedMarkerNotOne } from "./legacy-block-quote.js";
import type {
  Code,
  Construct,
  ConstructRecord,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";

const INDENT_TOKEN = "gfmFootnoteDefinitionIndent";

/**
 * Constructs that cannot end a definition because `remark-parse@8` has no such block.
 *
 * `remark-footnotes@2` builds its interruptor list out of rp8's OWN block methods
 * (`index.js:54-68`), so a construct rp8 never had cannot appear in that list and cannot
 * interrupt. Probing the whole flow map hands our additions an interrupting power rp8 does not
 * give them, and the definition stops a line early:
 *
 *     [^1]: body text / ⇥$$ / ␣␣%%       obs spans 3->5, we stopped at 4
 *
 * `$$` IS NOT LISTED HERE, and that is measured, not an oversight. The reasoning that rp8 has no
 * math applies to it word for word, yet excluding it costs 55 documents against 6 gained --
 * Obsidian's math fence really does end a definition, so whatever its footnote fork inherited
 * from rp8, it is not rp8's interruptor list for this construct. Priced three ways:
 *
 *     commentFlow + mathFlow    +15 / -55
 *     mathFlow alone             +6 / -55     <- the whole loss is math
 *     commentFlow alone          +9 /   0     <- shipped
 *
 * A DENY list of rp8's absentees, not an allow list of its methods. Oracle's warning was that a
 * name-based allow list silently drops a construct an extension REPLACED under a new name --
 * `legacyCodeFenced` is exactly that, and rp8 does have fenced code, so it must keep
 * interrupting. Naming only what rp8 lacks keeps replacements working by default.
 */
const ABSENT_FROM_RP8 = new Set(["commentFlow"]);

const interruptorCache = new WeakMap<ConstructRecord, ConstructRecord>();

/**
 * `constructs.flow` minus the constructs rp8 never had, built once per construct map.
 *
 * Keys stay strings so micromark's `null` default key survives, and an entry whose constructs are
 * all removed is dropped rather than left as an empty array.
 */
function rp8Interruptors(flow: ConstructRecord): ConstructRecord {
  const cached = interruptorCache.get(flow);
  if (cached !== undefined) return cached;

  const built: ConstructRecord = {};
  for (const [key, value] of Object.entries(flow)) {
    if (value === undefined) continue;
    const kept = (Array.isArray(value) ? value : [value]).filter(
      (construct) =>
        construct.name === undefined || !ABSENT_FROM_RP8.has(construct.name),
    );
    if (kept.length > 0) built[key] = kept;
  }

  interruptorCache.set(flow, built);
  return built;
}

/**
 * One raw tab continues a footnote definition.
 *
 * `micromark-extension-gfm-footnote` accepts a continuation line only when its indent serialises
 * to exactly four columns:
 *
 *     sliceSerialize(indent, true).length === constants.tabSize
 *
 * Behind a quote marker a tab cannot reach four. `>⇥` preprocesses to a raw tab plus the virtual
 * spaces up to the next stop, and from column 2 that stop is 4, so the indent serialises to three
 * -- the definition closes, and whatever follows becomes a sibling block. Obsidian keeps the
 * definition open, because `remark-parse@8` reads one tab as a whole indent wherever it starts:
 *
 *     > [^1]: def / >⇥# h      Obsidian: definition spans both lines
 *     > [^1]: def / >⇥$$       Obsidian: definition spans both lines
 *     > [^1]: def / > ⇥```     Obsidian: definition spans both lines
 *
 * The raw slice is what distinguishes them: virtual spaces are dropped when tabs are not
 * expanded, so an indent made of one tab slices to exactly `"\t"` whatever column it began at,
 * while a space indent is unaffected and still has to measure four. Stock's test is kept as the
 * first arm so no space-indented continuation changes.
 *
 * This is the other half of `legacyIndentedCodeSyntax`. Applying the tab rule only in flow moved
 * the boundary rather than fixing it: the definition closed here first, and the tab line was then
 * claimed as indented code, which cost 32 documents against 28 gained.
 */
function tokenizeLegacyIndent(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;

  return factorySpace(
    effects,
    afterPrefix,
    INDENT_TOKEN,
    constants.tabSize + 1,
  );

  function afterPrefix(code: Code): State | undefined {
    const tail = self.events[self.events.length - 1];
    if (!tail || tail[1].type !== INDENT_TOKEN) return nok(code);
    const expanded = tail[2].sliceSerialize(tail[1], true);
    const raw = tail[2].sliceSerialize(tail[1], false);
    return expanded.length === constants.tabSize || raw === "\t"
      ? ok(code)
      : nok(code);
  }
}

const legacyIndent: Construct = {
  tokenize: tokenizeLegacyIndent,
  partial: true,
};

/**
 * Does a NEW BLOCK start on this line? Asked the way `initialize/document.js` asks it.
 *
 * `factorySpace` over the line prefix, then `effects.attempt` against the REGISTERED construct
 * maps -- `document` for containers, `flow` for headings, fences, thematic breaks, html and link
 * definitions. An earlier attempt hand-assembled a construct array instead and cost 1172
 * documents.
 */
const newBlockAhead: Construct = {
  partial: true,
  tokenize: function tokenizeNewBlockAhead(
    this: TokenizeContext,
    effects: Effects,
    ok: State,
    nok: State,
  ): State {
    const self = this;
    return factorySpace(
      effects,
      maps,
      types.linePrefix,
      self.parser.constructs.disable.null?.includes("codeIndented") === true
        ? undefined
        : constants.tabSize,
    );

    function maps(code: Code): State | undefined {
      // A NON-1 ORDERED MARKER OPENS NOTHING, so it does not end the definition either.
      //
      // `list.js:81` is `!self.interrupt || code === codes.digit1`: only `1.` may interrupt, and
      // only when the flag is set. This probe runs with `self.interrupt` undefined -- which it
      // must, because setting it for the whole map interrupts nearly everywhere (-41, and -292
      // when restricted to three flagged constructs) -- so every marker opens a list here and
      // ends the definition. Obsidian keeps the line:
      //
      //     [^ch2*]: def / 10. [^2]: Prose here     obs REFERENCES "2", we DEFINE it
      //
      // 39 of the 46 position-identical def/ref swaps have NO blank line before the definition,
      // so the line should continue it, and 14 of those open with a non-1 ordered marker.
      //
      // `orderedMarkerNotOne` is `legacy-block-quote.ts`'s own construct, already measured there
      // for the rule that a quote ABSORBS such a line -- the same fact from the other side.
      return effects.check(orderedMarkerNotOne, nok, attemptMaps)(code);
    }

    function attemptMaps(code: Code): State | undefined {
      return effects.attempt(
        self.parser.constructs.document,
        ok,
        effects.attempt(rp8Interruptors(self.parser.constructs.flow), ok, nok),
      )(code);
    }
  },
};

/**
 * `remark-footnotes@2`'s continuation rule, read from its source rather than inferred.
 *
 * Stock gfm keeps a definition open only on a blank line or an indent of exactly four columns.
 * `remark-footnotes@2.0.0/index.js:172-223` is more permissive and reduces to one sentence:
 *
 *     A line continues the definition unless it is indented fewer than four columns AND
 *     either the previous line was blank or it starts a new block.
 *
 * So an UNINDENTED PARAGRAPH LINE CONTINUES IT, while an unindented heading, fence, quote, list,
 * table or definition ends it, and after a blank any unindented line ends it. The interrupt set
 * at `index.js:54-68` is "every block method except newline, indentedCode, paragraph and
 * footnoteDefinition", with footnoteDefinition appended.
 *
 * CROSS-VALIDATED: `definition-trim.ts` carries a table measured from the referee corpus in an
 * earlier session with no knowledge of this source -- definition 11 end/0 absorb, heading 4/0,
 * fence 4/0, thematic 1/0, plain TEXT 5 end/27 absorb. Block openers interrupt, plain text is
 * lazy continuation. Two independent derivations, one rule.
 *
 * FOUR THINGS ARE LOAD-BEARING, each measured:
 *
 *  - THE INDENT ARM IS ATTEMPTED FIRST, because four columns or more continues REGARDLESS of a
 *    preceding blank (rp8 expands a tab to its stop, so one leading tab is four columns).
 *  - `self.containerState` IS SAVED AND RESTORED. Container constructs WRITE into it -- the
 *    blockquote's start sets `state.open` -- so testing for an interruption with this
 *    definition's own live state object corrupts it. `document.js:153` resets it to `{}` before
 *    its own container check for exactly this reason. Without this: 0 gained, 1172 lost.
 *  - `self.interrupt` IS SET TO `undefined`, NOT `true`. With `true`, `list.js:81` admits only
 *    `1.`, so other markers stop interrupting and definitions swallow them; the corpus says a
 *    list marker usually ends a definition (42 end against 13 absorb). Flipping it: -6 to +6.
 *  - A BARE `[^1]:` ABSORBS NOTHING, which falls out of rp8's own loop rather than being a
 *    special case: its content scan starts PAST the label, so a bare opener's first line has
 *    `contentStart === contentEnd`, the very test it uses for "the previous line was blank".
 *
 * `closing-pre-interrupt.ts` is the precedent for the save/restore shape, for `self.interrupt`
 * alone; this extends it to `containerState`.
 */
function tokenizeLegacyContinuation(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State,
): State {
  const self = this;
  return start;

  function flag(): { _afterBlank?: boolean | undefined } | undefined {
    return self.containerState as
      { _afterBlank?: boolean | undefined } | undefined;
  }

  function start(code: Code): State | undefined {
    const state = flag();
    // gfm emits `gfmFootnoteDefinitionWhitespace` only when something followed the colon, so its
    // presence IS the bare-opener discriminator. Scoped to the current definition by walking
    // back to this one's `enter`, since `self.events` holds every earlier definition's tokens.
    if (state && state._afterBlank === undefined) {
      let index = self.events.length;
      let bare = true;
      while (index--) {
        const event = self.events[index];
        if (!event) break;
        if (event[1].type === "gfmFootnoteDefinitionWhitespace") {
          bare = false;
          break;
        }
        if (event[0] === "enter" && event[1].type === "gfmFootnoteDefinition") {
          break;
        }
      }
      state._afterBlank = bare;
    }
    return effects.check(blankLine, onBlank, notBlank)(code);
  }

  /** A blank continues the definition and ARMS the exit for the next line. */
  function onBlank(code: Code): State | undefined {
    const state = flag();
    if (state) state._afterBlank = true;
    return ok(code);
  }

  function notBlank(code: Code): State | undefined {
    return effects.attempt(legacyIndent, onIndented, onShallow)(code);
  }

  function onIndented(code: Code): State | undefined {
    const state = flag();
    if (state) state._afterBlank = false;
    return ok(code);
  }

  function onShallow(code: Code): State | undefined {
    if (flag()?._afterBlank === true) return nok(code);

    const savedInterrupt = self.interrupt;
    const savedState = self.containerState;
    self.interrupt = undefined;
    self.containerState = {};
    const restore =
      (next: State): State =>
      (restoreCode: Code) => {
        self.interrupt = savedInterrupt;
        self.containerState = savedState;
        return next(restoreCode);
      };

    return effects.check(newBlockAhead, restore(nok), restore(onLazy))(code);
  }

  function onLazy(code: Code): State | undefined {
    const state = flag();
    if (state) state._afterBlank = false;
    return ok(code);
  }
}

const asList = (
  entry: Construct | readonly Construct[] | undefined,
): readonly Construct[] =>
  Array.isArray(entry)
    ? entry
    : entry
      ? [entry as Construct]
      : ([] as readonly Construct[]);

/**
 * Rebuild gfm's definition construct with the legacy continuation, reusing ITS OWN opener.
 *
 * The opener is taken from the extension already registered rather than imported or copied.
 * `remark-gfm` has to be in the chain before this package anyway, so its construct is in
 * `micromarkExtensions` by the time this runs -- which means the opener is byte-identical to the
 * one that parses every other definition in the document, with no second dependency to drift and
 * no 175 lines of label scanning duplicated here. Only the continuation differs.
 *
 * Returns `null` when gfm is absent: there are then no footnote definitions to keep open, and
 * registering a construct with no opener to borrow would be worse than doing nothing.
 *
 * Named `legacyGfmFootnoteDefinition`, deliberately. `disable` is matched on a construct's NAME,
 * so sharing gfm's name would make `{disable: {null: ["gfmFootnoteDefinition"]}}` silently take
 * both -- the mistake that cost 74 tests when the vendored blockquote reused `"blockQuote"`. The
 * TOKEN types are unchanged, so `mdast-util-gfm-footnote` maps the result as before.
 */
export function legacyFootnoteDefinitionSyntax(
  registered: readonly Extension[],
): Extension | null {
  for (const extension of registered) {
    const stock = asList(
      extension.document?.[codes.leftSquareBracket] as
        Construct | readonly Construct[] | undefined,
    ).find((construct) => construct.name === "gfmFootnoteDefinition");
    if (!stock) continue;

    return {
      document: {
        [codes.leftSquareBracket]: {
          name: "legacyGfmFootnoteDefinition",
          tokenize: stock.tokenize,
          continuation: { tokenize: tokenizeLegacyContinuation },
          ...(stock.exit ? { exit: stock.exit } : {}),
        },
      },
    };
  }
  return null;
}
