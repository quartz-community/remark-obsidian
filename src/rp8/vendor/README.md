# Vendored remark-parse 8

The `legacy` preset parses with remark-parse 8, the parser Obsidian forks. It is vendored here
rather than depended on, for three reasons:

- **Nothing reaches `node_modules` at run time.** The package ships a bundle with no runtime
  dependencies, so a dependency would be bundled anyway — invisible to `npm audit` and outside
  the ReDoS lint.
- **remark-parse 8 pulls in `trim@0.0.1`**, whose `/^\s*|\s*$/g` is a published ReDoS
  (GHSA-w5p7-h5w8-2hfq).
- **Its tag expressions backtrack exponentially** (see below), which needed a code change.

| directory / file    | source                                                                                                                                                                                             | licence |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `remark-parse/`     | remark-parse 8.0.3 `lib/` (Titus Wormer)                                                                                                                                                           | MIT     |
| `remark-footnotes/` | remark-footnotes 2.0.0 (Titus Wormer)                                                                                                                                                              | MIT     |
| `remark-math/`      | remark-math 3.0.1 (Junyoung Choi)                                                                                                                                                                  | MIT     |
| `parse-entities/`   | parse-entities 2.0.0 (Titus Wormer)                                                                                                                                                                | MIT     |
| `entities-v1.ts`    | character-entities 1.2.4, character-entities-legacy 1.1.4, character-reference-invalid 1.1.4 (Titus Wormer)                                                                                        | MIT     |
| `helpers.ts`        | trim, repeat-string, xtend, is-*, trim-trailing-lines, collapse-white-space, ccount, state-toggle, markdown-escapes, vfile-location 3, unist-util-remove-position 2 — rewritten from their sources | MIT     |

## How it was made

`scripts/vendor-rp8.py` converts each CommonJS file to ESM TypeScript under `@ts-nocheck`:
`require` becomes `import`, `module.exports` becomes `export default`, and the helper packages
are routed to `helpers.ts`. The code is otherwise as published, and the files are excluded from
prettier so they stay diffable against upstream. They are `.ts` so the ReDoS lint covers every
expression in them — which is how the defects below were found.

The v1 entity tables are NOT the modern packages' tables: 97 prefix entries and 4 values differ,
and parse-entities 2's greedy legacy matcher depends on exactly these.

## Changed after conversion

Re-running the converter overwrites these; reapply them.

| file                                  | change                                                                                                    | why                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `remark-parse/util/html.ts`           | `openCloseTag` and `tag` replaced by `matchOpenCloseTag`, a set-of-states automaton over the same grammar | the published expressions backtrack **exponentially** (`recheck`); its 205-character attack string took 134 s in one `.test`, 270 s to parse a note holding only that line |
| `remark-parse/util/html.ts`           | `declaration`: `\s+[^>]*` became `\s[^>]*`                                                                | quadratic on a long space run (834 ms at 40,000 spaces); `[^>]` holds every `\s`, so the language and the match are the same                                               |
| `remark-parse/tokenize/html-block.ts` | `otherElementOpenExpression` built on `matchOpenCloseTag`                                                 | it was compiled from `openCloseTag.source`                                                                                                                                 |
| `helpers.ts`                          | `trim` is `String.prototype.trim`; `trimTrailingLines` is a loop                                          | the published expressions are ReDoS-prone; both are the same function                                                                                                      |

## Proof it reads the same

`test/rp8-vendored.test.ts` builds the vendored parser and the published one (the `remarkParse8`,
`remarkFootnotes2` and `remarkMath3` dev dependencies) identically and requires byte-identical
trees on every corpus document and pathological shape. The tag matcher is held to the published
expressions at every `<` in the corpus and on 300,000 generated tag shapes (5,000,000 were run
once offline, with zero disagreements).

The speed-ups in `../reader.ts` are separate from the vendored code and have their own proof,
`test/rp8-speedups.test.ts`.
