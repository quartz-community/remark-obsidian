/**
 * GFM's footnote syntax with Obsidian's label rule, for `strict`.
 *
 * Vendored from `micromark-extension-gfm-footnote` 2.1.0 (`dev/lib/syntax.js`, MIT, Titus
 * Wormer), which `remark-gfm` registers. Footnotes are in neither CommonMark nor GFM's spec, so
 * `strict` follows Obsidian where the two readings differ -- and for a label they differ twice,
 * both measured against the live app (1.15.0, 2026-10-27):
 *
 * - **A `[` may sit inside a label.** `a[^x[y]` over `[^x[y]: d` and `a[^[x]` over `[^[x]: d`
 *   are a reference and a definition to Obsidian; GFM rejects the `[` and makes neither.
 * - **A backslash does not escape the `]`.** `a[^a\]b]` over `[^a\]b]: d` is plain text to
 *   Obsidian, whose label runs to the first `]`; GFM reads one label, `a]b`.
 *
 * Everything else is upstream's, line for line. The constructs take new names and disable
 * upstream's, because `disable` matches on a construct's name: under upstream's names a caller
 * disabling GFM footnotes would silently disable these too, and leaving upstream's enabled would
 * let them accept the labels these refuse. The token types are upstream's, so
 * `mdast-util-gfm-footnote` builds the nodes unchanged.
 */
import { blankLine } from "micromark-core-commonmark";
import { factorySpace } from "micromark-factory-space";
import { markdownLineEndingOrSpace } from "micromark-util-character";
import { codes, constants, types } from "micromark-util-symbol";
import type {
  Code,
  Event,
  Exiter,
  Extension,
  Resolver,
  State,
  Token,
  TokenizeContext,
  Tokenizer,
} from "micromark-util-types";

/** `micromark-util-normalize-identifier`, inlined: it is not a direct dependency. */
function normalizeIdentifier(value: string): string {
  return value
    .replace(/[\t\n\r ]+/g, " ")
    .replace(/^ | $/g, "")
    .toLowerCase()
    .toUpperCase();
}

interface Parser {
  gfmFootnotes?: string[];
}

const defined = (self: TokenizeContext): string[] => {
  const parser = self.parser as typeof self.parser & Parser;
  return (parser.gfmFootnotes ??= []);
};

const indent = { tokenize: tokenizeIndent, partial: true };

/** Upstream's constructs, disabled so that only these read a footnote. */
const UPSTREAM = [
  "gfmFootnoteDefinition",
  "gfmFootnoteCall",
  "gfmPotentialFootnoteCall",
];

export function obsidianFootnoteSyntax(): Extension {
  return {
    document: {
      [codes.leftSquareBracket]: {
        name: "obsidianFootnoteDefinition",
        tokenize: tokenizeDefinitionStart,
        continuation: { tokenize: tokenizeDefinitionContinuation },
        exit: gfmFootnoteDefinitionEnd,
      },
    },
    text: {
      [codes.leftSquareBracket]: {
        name: "obsidianFootnoteCall",
        tokenize: tokenizeGfmFootnoteCall,
      },
      [codes.rightSquareBracket]: {
        name: "obsidianPotentialFootnoteCall",
        add: "after",
        tokenize: tokenizePotentialGfmFootnoteCall,
        resolveTo: resolveToPotentialGfmFootnoteCall,
      },
    },
    disable: { null: UPSTREAM },
  };
}

/** Upstream's, unchanged: a `[^x]` that a link label started. */
function tokenizePotentialGfmFootnoteCall(
  this: TokenizeContext,
  effects: Parameters<Tokenizer>[0],
  ok: State,
  nok: State,
): State {
  const self = this;
  let index = self.events.length;
  const names = defined(self);
  let labelStart: (Token & { _balanced?: boolean }) | undefined;

  while (index--) {
    const token = self.events[index]![1];
    if (token.type === types.labelImage) {
      labelStart = token;
      break;
    }
    if (
      token.type === "gfmFootnoteCall" ||
      token.type === types.labelLink ||
      token.type === types.label ||
      token.type === types.image ||
      token.type === types.link
    ) {
      break;
    }
  }

  return start;

  function start(code: Code): State | undefined {
    if (!labelStart || !labelStart._balanced) return nok(code);
    const id = normalizeIdentifier(
      self.sliceSerialize({ start: labelStart.end, end: self.now() }),
    );
    if (id.codePointAt(0) !== codes.caret || !names.includes(id.slice(1))) {
      return nok(code);
    }
    effects.enter("gfmFootnoteCallLabelMarker");
    effects.consume(code);
    effects.exit("gfmFootnoteCallLabelMarker");
    return ok(code);
  }
}

/** Upstream's, unchanged. */
const resolveToPotentialGfmFootnoteCall: Resolver = (events, context) => {
  let index = events.length;
  let labelStart: Token | undefined;

  while (index--) {
    if (
      events[index]![1].type === types.labelImage &&
      events[index]![0] === "enter"
    ) {
      labelStart = events[index]![1];
      break;
    }
  }
  if (!labelStart) return events;

  events[index + 1]![1].type = types.data;
  events[index + 3]![1].type = "gfmFootnoteCallLabelMarker";

  const call: Token = {
    type: "gfmFootnoteCall",
    start: { ...events[index + 3]![1].start },
    end: { ...events[events.length - 1]![1].end },
  };
  const marker: Token = {
    type: "gfmFootnoteCallMarker",
    start: { ...events[index + 3]![1].end },
    end: { ...events[index + 3]![1].end },
  };
  marker.end.column++;
  marker.end.offset++;
  marker.end._bufferIndex++;
  const string: Token = {
    type: "gfmFootnoteCallString",
    start: { ...marker.end },
    end: { ...events[events.length - 1]![1].start },
  };
  const chunk: Token = {
    type: types.chunkString,
    contentType: "string",
    start: { ...string.start },
    end: { ...string.end },
  };

  const replacement: Event[] = [
    events[index + 1]!,
    events[index + 2]!,
    ["enter", call, context],
    events[index + 3]!,
    events[index + 4]!,
    ["enter", marker, context],
    ["exit", marker, context],
    ["enter", string, context],
    ["enter", chunk, context],
    ["exit", chunk, context],
    ["exit", string, context],
    events[events.length - 2]!,
    events[events.length - 1]!,
    ["exit", call, context],
  ];
  events.splice(index, events.length - index + 1, ...replacement);
  return events;
};

/** A reference. Obsidian's label: a `[` is content and a backslash escapes nothing. */
function tokenizeGfmFootnoteCall(
  this: TokenizeContext,
  effects: Parameters<Tokenizer>[0],
  ok: State,
  nok: State,
): State {
  const self = this;
  const names = defined(self);
  let size = 0;
  let data = false;

  return start;

  function start(code: Code): State | undefined {
    effects.enter("gfmFootnoteCall");
    effects.enter("gfmFootnoteCallLabelMarker");
    effects.consume(code);
    effects.exit("gfmFootnoteCallLabelMarker");
    return callStart;
  }

  function callStart(code: Code): State | undefined {
    if (code !== codes.caret) return nok(code);
    effects.enter("gfmFootnoteCallMarker");
    effects.consume(code);
    effects.exit("gfmFootnoteCallMarker");
    effects.enter("gfmFootnoteCallString");
    effects.enter("chunkString").contentType = "string";
    return callData;
  }

  function callData(code: Code): State | undefined {
    if (
      size > constants.linkReferenceSizeMax ||
      (code === codes.rightSquareBracket && !data) ||
      code === codes.eof ||
      markdownLineEndingOrSpace(code)
    ) {
      return nok(code);
    }

    if (code === codes.rightSquareBracket) {
      effects.exit("chunkString");
      const token = effects.exit("gfmFootnoteCallString");
      if (!names.includes(normalizeIdentifier(self.sliceSerialize(token)))) {
        return nok(code);
      }
      effects.enter("gfmFootnoteCallLabelMarker");
      effects.consume(code);
      effects.exit("gfmFootnoteCallLabelMarker");
      effects.exit("gfmFootnoteCall");
      return ok;
    }

    data = true;
    size++;
    effects.consume(code);
    return callData;
  }
}

/** A definition's label line. The same label rule as a reference. */
function tokenizeDefinitionStart(
  this: TokenizeContext,
  effects: Parameters<Tokenizer>[0],
  ok: State,
  nok: State,
): State {
  const self = this;
  const names = defined(self);
  let identifier = "";
  let size = 0;
  let data = false;

  return start;

  function start(code: Code): State | undefined {
    const definition = effects.enter("gfmFootnoteDefinition");
    (definition as Token & { _container?: boolean })._container = true;
    effects.enter("gfmFootnoteDefinitionLabel");
    effects.enter("gfmFootnoteDefinitionLabelMarker");
    effects.consume(code);
    effects.exit("gfmFootnoteDefinitionLabelMarker");
    return labelAtMarker;
  }

  function labelAtMarker(code: Code): State | undefined {
    if (code !== codes.caret) return nok(code);
    effects.enter("gfmFootnoteDefinitionMarker");
    effects.consume(code);
    effects.exit("gfmFootnoteDefinitionMarker");
    effects.enter("gfmFootnoteDefinitionLabelString");
    effects.enter("chunkString").contentType = "string";
    return labelInside;
  }

  function labelInside(code: Code): State | undefined {
    if (
      size > constants.linkReferenceSizeMax ||
      (code === codes.rightSquareBracket && !data) ||
      code === codes.eof ||
      markdownLineEndingOrSpace(code)
    ) {
      return nok(code);
    }

    if (code === codes.rightSquareBracket) {
      effects.exit("chunkString");
      const token = effects.exit("gfmFootnoteDefinitionLabelString");
      identifier = normalizeIdentifier(self.sliceSerialize(token));
      effects.enter("gfmFootnoteDefinitionLabelMarker");
      effects.consume(code);
      effects.exit("gfmFootnoteDefinitionLabelMarker");
      effects.exit("gfmFootnoteDefinitionLabel");
      return labelAfter;
    }

    data = true;
    size++;
    effects.consume(code);
    return labelInside;
  }

  function labelAfter(code: Code): State | undefined {
    if (code !== codes.colon) return nok(code);
    effects.enter("definitionMarker");
    effects.consume(code);
    effects.exit("definitionMarker");
    if (!names.includes(identifier)) names.push(identifier);
    return factorySpace(effects, ok, "gfmFootnoteDefinitionWhitespace");
  }
}

/** Upstream's, unchanged. */
function tokenizeDefinitionContinuation(
  this: TokenizeContext,
  effects: Parameters<Tokenizer>[0],
  ok: State,
  nok: State,
): State {
  return effects.check(blankLine, ok, effects.attempt(indent, ok, nok));
}

/** Upstream's, unchanged. */
const gfmFootnoteDefinitionEnd: Exiter = function (effects) {
  effects.exit("gfmFootnoteDefinition");
};

/** Upstream's, unchanged. */
function tokenizeIndent(
  this: TokenizeContext,
  effects: Parameters<Tokenizer>[0],
  ok: State,
  nok: State,
): State {
  const self = this;
  return factorySpace(
    effects,
    afterPrefix,
    "gfmFootnoteDefinitionIndent",
    constants.tabSize + 1,
  );

  function afterPrefix(code: Code): State | undefined {
    const tail = self.events[self.events.length - 1];
    return tail &&
      tail[1].type === "gfmFootnoteDefinitionIndent" &&
      tail[2].sliceSerialize(tail[1], true).length === constants.tabSize
      ? ok(code)
      : nok(code);
  }
}
