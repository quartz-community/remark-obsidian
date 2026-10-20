---
"@quartz-community/remark-obsidian": patch
---

An indented line below a non-1 ordered marker under a quote is root code.

`2.`, `10.` and `2)` cannot interrupt a paragraph, so below a quote they do not open a list --
the line is lazy continuation, and an indented line beneath it falls to ROOT indented code.
`container-lazy.ts` already carries that reasoning for a callout host; this is the same rule with
a quote host, the input class it was never scoped for.

Measured against live Obsidian, `>` / `<marker>` / `<5sp>Some`:

```
1.  no code     2.  code@2      -  no code
1)  no code     2)  code@2      *  no code
                10. code@2      +  no code
```

So the discriminator is `start !== 1` rather than the marker's width, a bullet never releases
however wide, and the quote is required -- a blank line in its place releases nothing. The shape
carries 19 of the 883 code-bearing referee documents with 15 diverging, 78.9% against a 6.5% base
rate, the strongest conditional signal measured on this corpus.

Two guards keep it honest, both derived from documents an unguarded version cost. The released run
must be CONTIGUOUS with the marker line, because lazy continuation continues the line above it and
an intervening column-0 definition means the list has already ended. And the line must be STRICTLY
DEEPER than the item's content column -- the inverse of the shallow test the sibling arm applies,
since this one is about a line too deep to be item content rather than too shallow to belong.

Obsidian's code-block ranges move from 826/883 to 834/883 agreeing. The footnote dimension holds
at 5994/6818 as a two-for-two trade rather than an identity hold: two documents whose item content
is itself a footnote definition now lose their definition to the released code, and two others
gain. Those two are a measured lead and not a mystery -- a definition-hosted item's deeper line
continues the definition -- but narrowing for them would be a fourth pass over this rule, so it is
recorded instead.
