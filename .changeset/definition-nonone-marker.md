---
"@quartz-community/remark-obsidian": patch
---

A non-1 ordered marker does not end a footnote definition.

`list.js:81` is `!self.interrupt || code === codes.digit1`: only `1.` may interrupt a paragraph,
and only when the interrupt flag is set. The definition's block probe runs with `self.interrupt`
undefined — which it must, since setting it for the whole construct map interrupts nearly
everywhere — so every marker opened a list there and ended the definition. Obsidian keeps the
line:

    [^ch2*]: def / 10. [^2]: Prose here     obs REFERENCES "2", we DEFINED it

HOW IT WAS FOUND. Classifying the `def-extra` + `ref-miss` pair BY POSITION rather than by name
gives 73 documents that are a pure swap — same name, same line, same column, we report a
definition where Obsidian reports a reference. Of those, 66 have the name defined nowhere, and
after excluding the 20 covered by a `%%` region, 39 of the remaining 46 have NO blank line before
the definition, so the line should continue it. 14 of those open with a non-1 ordered marker.

`orderedMarkerNotOne` is `legacy-block-quote.ts`'s own construct, already measured there for the
rule that a blockquote ABSORBS such a line — the same fact from the other side, so this reuses a
measured construct rather than adding arithmetic.

The scoping is what makes it work, and the alternatives are priced: setting `self.interrupt` for
the whole flow map cost 41 documents with zero gained, because that map also holds `content` and
`codeIndented`, the two constructs rp8's interruptor list explicitly excludes; restricting the
flagged probe to `codeFenced`, `htmlFlow` and `setextUnderline` cost 292, because
`setextUnderline` cannot be attempted standalone. Excluding one construct from the unflagged
probe reaches the same documents without disturbing the rest.

    referee 6170 -> 6199 / 6818   +32 GAINED, 3 LOST, by --ids identity
    main parity gate green, 450 tests pass, 0 probes drifted, 4 gates green
