/**
 * The channel between `legacyBlockQuoteSyntax` and `legacyCodeFencedSyntax`.
 *
 * The two rules are one rule -- a quoted fence runs to its QUOTED closer -- but it has to be
 * enforced from both sides, and neither side can see the other's state:
 *
 *   - the DOCUMENT tokenizer runs the quote's continuation and knows whether the line carried a
 *     `>`, but not whether the quote's child flow currently holds an open fence;
 *   - the FLOW tokenizer runs the fence and knows it is open, but cannot tell a fence at root
 *     from one in a quote from one in a list item -- its `containerState` is an empty object in
 *     all three cases, measured.
 *
 * So each publishes the one fact the other lacks. Keyed per parser, which is the channel
 * micromark itself uses for exactly this purpose: `initialize/document.js` publishes
 * `parser.lazy[line]` from the document tokenizer and `partial-non-lazy-continuation.js` reads
 * it from the flow tokenizer. Line numbers are absolute in both, so the two agree.
 */
const quoteLazyLines = new WeakMap<object, Set<number>>();
const openFences = new WeakMap<object, number>();

/** Lines an OPEN blockquote did not carry, and so absorbed rather than closing on. */
export function markQuoteLazyLine(parser: object, line: number): undefined {
  let lines = quoteLazyLines.get(parser);
  if (!lines) {
    lines = new Set();
    quoteLazyLines.set(parser, lines);
  }
  lines.add(line);
}

export function isQuoteLazyLine(parser: object, line: number): boolean {
  return quoteLazyLines.get(parser)?.has(line) === true;
}

/**
 * Counted rather than flagged: micromark attempts a construct speculatively and rolls back, so
 * the same fence can be entered more than once before it resolves, and a plain boolean would be
 * cleared by the first of them to finish.
 */
export function enterFence(parser: object): undefined {
  openFences.set(parser, (openFences.get(parser) ?? 0) + 1);
}

export function exitFence(parser: object): undefined {
  openFences.set(parser, Math.max(0, (openFences.get(parser) ?? 0) - 1));
}

export function isFenceOpen(parser: object): boolean {
  return (openFences.get(parser) ?? 0) > 0;
}
