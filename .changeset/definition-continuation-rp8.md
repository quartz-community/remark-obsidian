---
"@quartz-community/remark-obsidian": patch
---

A footnote definition continues onto a lazy line, as `remark-footnotes@2` does.

Stock gfm keeps a definition open only on a blank line or an indent of exactly four columns.
`remark-footnotes@2.0.0/index.js:172-223` — the parser Obsidian's fork descends from — is more
permissive, and its loop reduces to one sentence:

> A line continues the definition unless it is indented fewer than four columns AND either the
> previous line was blank or it starts a new block.

So an unindented paragraph line continues it, while an unindented heading, fence, quote, list,
table or definition ends it, and after a blank line any unindented line ends it. The interrupt set
at `index.js:54-68` is "every block method except `newline`, `indentedCode`, `paragraph` and
`footnoteDefinition`", with `footnoteDefinition` appended.

CROSS-VALIDATED before implementing. `definition-trim.ts` carries a table measured from the
referee corpus in an earlier session with no knowledge of that source — definition 11 end/0
absorb, heading 4/0, fence 4/0, thematic 1/0, plain TEXT 5 end/27 absorb. Block openers interrupt,
plain text is lazy continuation. Two independent derivations, one rule.

Four things are load-bearing, each measured:

- The indent arm is attempted FIRST, because four columns or more continues regardless of a
  preceding blank (rp8 expands a tab to its stop, so one leading tab is four columns).
- `self.containerState` is saved and restored around the block test. Container constructs WRITE
  into it, so testing an interruption with the definition's own live state object corrupts it;
  `document.js:153` resets it for exactly this reason. Without this: 0 gained, 1172 lost.
- `self.interrupt` is set to `undefined`, not `true`. With `true`, `list.js:81` admits only `1.`,
  so other markers stop interrupting and definitions swallow them.
- A bare `[^1]:` absorbs nothing, which falls out of rp8's own loop: its content scan starts past
  the label, so a bare opener's first line has `contentStart === contentEnd`.

`definitionAbsorbedItemTransform` completes the half the tokenizer pre-empts. `definitionLazy`
nests a SIBLING paragraph into a trailing list item — `fuzz/footnote/18` (`[^1]: -` / `y^2$`)
reports `listItems` spanning `0:6-1:4`, which only holds if the paragraph sits inside the empty
item. Once the continuation absorbs that line itself there is no sibling left, so the new pass
nests an already-absorbed trailing paragraph instead.

    referee 6163 -> 6170 / 6818   +12 GAINED, 5 LOST, by --ids identity
    main parity gate green, positioned-oracle ceiling unchanged at 18
    450 tests pass, 4 gates green
    the recorded fence-in-definition reproducer now AGREES with Obsidian
