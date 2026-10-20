---
"@quartz-community/remark-obsidian": patch
---

Consecutive indented code lines are one block, not two.

Micromark splits a run of indented lines into separate `code` nodes when a quote carrying a
heading sits above them, where CommonMark and Obsidian both read a single block:

```
    a /     b                         one block
> q / blank /     a /     b           one block
> [!note] / > # h /     a /     b     micromark: TWO -- the split
```

The divergence is upstream and not introduced here: bare `remark-parse` + `remark-gfm` reports
the identical pair on every document measured. CommonMark has no mechanism that would split two
consecutive indented chunks, so this is a correction both of this package's targets want rather
than a preset divergence, and it is therefore ungated.

Adjacent root-level `code` nodes on contiguous lines are merged. Fenced blocks are excluded --
two in a row are legitimately separate, and a fence cannot be told from an indented block by its
node, since an info-string-less fence also carries `lang: null`, so the opening line is read from
the source. Strictly contiguous, which is narrower than CommonMark's own rule that a blank line
inside indented code also belongs to the block; that widening is unmeasured and deliberately not
taken.

Obsidian's own code-block ranges move from 814/883 to 826/883 agreeing, with the footnote
dimension unchanged at 5994/6818 and no corpus regressions.
