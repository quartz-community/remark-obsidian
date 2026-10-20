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

Obsidian's code-block ranges move from 826/883 to 832/883 agreeing and the footnote dimension from
5994/6818 to 5996/6818, with ZERO regressions on either -- verified by comparing the agreeing sets
by identity rather than by their totals, since two documents trading cancel perfectly in a net
figure.

A third guard earns that. The quote must be ADJACENT to the marker and not merely its previous
sibling, because a blank line between them closes the quote, so the marker opens a real list and
the deeper lines become the footnote definition's own content:

```
>  / 10. [^a]: def / <6sp>%%            code@2   def a@1-1
>  / blank / 10. [^a]: def / <6sp>%%    no code  def a@2-3
```

A blank line is not a node, so the sibling test cannot see it. That shape is both documents an
earlier attempt traded away, and the definition ending at line 3 rather than 1 is the oracle
saying those lines belong to it.
