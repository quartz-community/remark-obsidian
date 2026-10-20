---
"@quartz-community/remark-obsidian": patch
---

A tab-indented definition under an ordered host counts the spaces after the tab.

`definition-column.ts` short-circuited an all-whitespace prefix beginning with a tab to the NUMBER
OF TABS, discarding both the spaces after it and the host's content column. Under an ordered host
that is too coarse — the column moves with what follows the tab, and all three spellings have a tab
run of one:

```
host "  1.<5sp>More"    <TAB> 1   <TAB><1sp> 2   <TAB><4sp> 3
host "  *<5sp>More"      <TAB> 1   <TAB><1sp> 1   <TAB><4sp> none
host "1.<5sp>More"       <TAB> 1   <TAB><1sp> 1   <TAB><4sp> none
```

`min(tabRun + spacesAfterTabs, hostIndent + 1)` produces exactly 1, 2 and 3, and scoping it to an
ordered host is what keeps every bullet row at 1 — including the branch's own control, `- p` over
`<TAB><1sp>`, where the same two characters report 1.

The `def-prefix-by-host` grid crosses the definition's prefix with the host and goes from 2
diverging cells to 0 of 42. Footnote agreement moves from 6010/6818 to 6013/6818 with zero
regressions, verified by comparing the agreeing sets by identity rather than by their totals.
