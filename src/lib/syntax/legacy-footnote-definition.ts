import { blankLine } from "micromark-core-commonmark";
import { factorySpace } from "micromark-factory-space";
import { codes, constants } from "micromark-util-symbol";
import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext,
} from "micromark-util-types";

const INDENT_TOKEN = "gfmFootnoteDefinitionIndent";

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

function tokenizeLegacyContinuation(
  effects: Effects,
  ok: State,
  nok: State,
): State {
  return effects.check(
    blankLine,
    ok,
    effects.attempt(legacyIndent, ok, nok),
  ) as State;
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
