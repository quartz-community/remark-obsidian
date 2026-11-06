/**
 * The `legacy` reading as a plain function, for a consumer that only reads.
 *
 * `remarkObsidian` holds both presets and every writer, so importing it bundles `strict`'s
 * micromark chain and the `toMarkdown` handlers whichever preset runs, and no `sideEffects` flag
 * or module split can drop them: one function reaches them all. This entry reaches only the
 * remark-parse 8 path. It takes the same options with the same defaults and returns the tree
 * `unified().use(remarkObsidian, options).parse(text)` returns, which
 * `test/legacy-entry.test.ts` holds over the corpus.
 */
import type { Root } from "mdast";

import "./lib/types.js";

import {
  legacyDefaults,
  parseLegacy8,
  type LegacyOptions,
} from "./rp8/adapt.js";

export type {
  Wikilink,
  Highlight,
  Comment,
  Tag,
  InlineFootnote,
  Callout,
  CalloutTitle,
} from "./lib/types.js";

export type LegacyParseOptions = Partial<LegacyOptions>;

/** Reads `text` as the `legacy` preset does. `text` is the whole input; no processor is involved. */
export function parse(text: string, options?: LegacyParseOptions): Root {
  return parseLegacy8(text, { ...legacyDefaults, ...options });
}
