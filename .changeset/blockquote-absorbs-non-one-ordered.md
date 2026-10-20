---
"@quartz-community/remark-obsidian": patch
---

A blockquote absorbs a line opening a non-1 ordered marker.

CommonMark lets an ordered item interrupt a paragraph only at 1, so `2.`, `10.` and `2)` open
nothing and the line continues the quote. Micromark enforces that rule at root and not on the line
after a blockquote; Obsidian enforces both, so this is a correction both of this package's targets
want rather than a preset divergence:

```
para / 2. x     stock  paragraph@0-1              the rule applied
> q  / 2. x     stock  blockquote@0-0 + list@1-1  the rule skipped
> q  / 2. x     obs    blockquote@0-1             absorbed
```

Eight shapes match live 1.14.4 exactly, the five controls included — `1.`, a bullet, a
blank-separated marker, a bare `2. x` and a marker inside the quote all keep stock behaviour.

`legacy-block-quote.ts` vendors micromark's construct with one change, in the CONTINUATION: a quote
that is already open claims a line whose first construct is a non-1 ordered marker. The marker's
value is accumulated as a string rather than tested on its first digit, because `10.` begins with
`1` and must still be absorbed.

**The same rule as a list declining to open is not merely riskier, it is inert.** Instrumented at
the decision point, every clause fired correctly and the construct was then attempted a second time
with the quote already closed, so the list opened anyway: declining a container makes the document
tokenizer close containers and retry, while only a container extending itself can claim a line.
That attempt also tripped micromark's own `expected exit token to match current token` invariant,
which is the same retry seen from the other side.

Footnote agreement moves from 5994/6818 to 6010/6818 and Obsidian's code-block ranges from 826/883
to 843/883. Three documents regress, all with a quote above a non-1 marker where Obsidian does not
absorb, and they are recorded rather than narrowed for.
